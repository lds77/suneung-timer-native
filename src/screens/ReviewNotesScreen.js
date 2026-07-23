// src/screens/ReviewNotesScreen.js
// 오답노트 — 영구 학습 노트(과목·챕터별). 과목 탭/할일 양쪽에서 { visible, onClose }로 재사용.
// 설계: docs/review-notes-design.md. 순수 로직: utils/reviewNotes.js
import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert, StyleSheet, Platform, KeyboardAvoidingView, useWindowDimensions, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../hooks/useAppState';
import { getTheme } from '../constants/colors';
import { groupBySubjectChapter, chapterSuggestions, UNCATEGORIZED } from '../utils/reviewNotes';
import { saveImage, deleteFiles, resolveUri, canAddMore, MAX_ATTACH } from '../utils/attachments';

// 강조 색 라벨 팔레트 (요청#3 흡수 — 항목 전체 색 강조)
const NOTE_COLORS = ['#E8575A', '#F5A623', '#4A90D9', '#5CB85C', '#9B6FC3'];
const DANGER = '#E8575A';
const MASTERED = '#00B894'; // 마스터 완료 표시(성공 녹색)

export default function ReviewNotesScreen({ visible, onClose, initialSubjectId = null }) {
  const app = useApp();
  const { height: winH } = useWindowDimensions();
  const sheetScrollMax = Math.round(winH * 0.78); // 시트를 화면에 맞춰 크게 — 보통은 스크롤 없이 한눈에
  const T = getTheme(app.settings.darkMode, app.settings.accentColor, app.settings.fontScale, app.settings.stylePreset);
  const notes = app.reviewNotes || [];
  const subjects = app.subjects || [];

  const [filterSubject, setFilterSubject] = useState('all'); // 'all' | subjectId | 'null'
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState([]); // id 배열 (Set 대신 배열 — 리렌더 단순)
  const [editor, setEditor] = useState(null);   // null | { id, subjectId, chapter, title, body, color }
  const [collapsed, setCollapsed] = useState({}); // 챕터 접기: key `${sid}|${chapterRaw}` → true
  const [sortMode, setSortMode] = useState('recent'); // 'recent' | 'review'(안 본 순)
  const [reviewOnly, setReviewOnly] = useState(false); // 마스터 안 한 것만 (복습 필요)
  const [viewer, setViewer] = useState(null);   // 전체보기 이미지 uri (null=닫힘)

  useEffect(() => {
    if (!visible) return;
    setFilterSubject(initialSubjectId || 'all');
    setSelectMode(false); setSelected([]); setEditor(null); setCollapsed({});
    setSortMode('recent'); setReviewOnly(false);
  }, [visible, initialSubjectId]);

  const filtered = useMemo(() => {
    let list = notes;
    if (filterSubject === 'null') list = list.filter(n => n.subjectId == null);
    else if (filterSubject !== 'all') list = list.filter(n => n.subjectId === filterSubject);
    if (reviewOnly) list = list.filter(n => !n.mastered);
    return list;
  }, [notes, filterSubject, reviewOnly]);

  const groups = useMemo(() => groupBySubjectChapter(filtered, subjects, { sort: sortMode }), [filtered, subjects, sortMode]);

  // 마지막 복습 상대 시각 ('오늘' / '어제' / 'N일 전')
  const reviewedAgo = (ts) => {
    if (!ts) return null;
    const days = Math.floor((Date.now() - ts) / 86400000);
    return days <= 0 ? '오늘' : days === 1 ? '어제' : `${days}일 전`;
  };

  const subjectChips = useMemo(() => {
    const has = new Set(notes.map(n => n.subjectId ?? 'null'));
    const chips = [{ key: 'all', label: '전체', color: null }];
    subjects.forEach(s => { if (has.has(s.id)) chips.push({ key: s.id, label: s.name, color: s.color }); });
    if (has.has('null')) chips.push({ key: 'null', label: UNCATEGORIZED, color: null });
    return chips;
  }, [notes, subjects]);

  const isSel = (id) => selected.includes(id);
  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const startSelect = (id) => { setSelectMode(true); setSelected(id ? [id] : []); };
  const exitSelect = () => { setSelectMode(false); setSelected([]); };
  const selectAllVisible = () => setSelected(filtered.map(n => n.id));
  const deleteSelected = () => {
    if (selected.length === 0) return;
    Alert.alert('오답 삭제', `${selected.length}개를 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => { app.deleteReviewNotes(selected); exitSelect(); } },
    ]);
  };

  const openNew = () => setEditor({
    id: null,
    subjectId: (filterSubject !== 'all' && filterSubject !== 'null') ? filterSubject : null,
    chapter: '', title: '', body: '', color: null,
    attachments: [], origFiles: [],
  });
  const openEdit = (note) => {
    const atts = Array.isArray(note.attachments) ? note.attachments.map(a => ({ file: a.file })) : [];
    setEditor({
      id: note.id, subjectId: note.subjectId ?? null, chapter: note.chapter ?? '',
      title: note.title ?? '', body: note.body ?? '', color: note.color ?? null,
      attachments: atts, origFiles: atts.map(a => a.file),
    });
  };
  // 저장 없이 닫을 때: 이번에 새로 추가했다가 남은 사진 파일을 정리(고아 방지)
  const discardAddedFiles = (e) => {
    if (!e) return;
    const added = (e.attachments || []).map(a => a.file).filter(f => f && !e.origFiles.includes(f));
    if (added.length) deleteFiles(added);
  };
  const closeEditor = () => { discardAddedFiles(editor); setEditor(null); };
  const saveEditor = () => {
    const e = editor;
    if (!e) return;
    if (!e.title.trim() && !e.body.trim()) { app.showToastCustom('제목이나 내용을 입력하세요', 'paengi'); return; }
    const subj = subjects.find(s => s.id === e.subjectId);
    const patch = {
      subjectId: e.subjectId ?? null,
      subjectLabel: subj?.name ?? null, subjectColor: subj?.color ?? null, subjectIcon: subj?.character ?? null,
      chapter: e.chapter.trim(), title: e.title.trim(), body: e.body.trim(), color: e.color ?? null,
      attachments: (e.attachments || []).map(a => ({ file: a.file })),
    };
    if (e.id) app.updateReviewNote(e.id, patch);
    else app.addReviewNote(patch);
    setEditor(null); // 저장했으므로 discard 안 함 (추가한 사진 유지)
  };
  const deleteFromEditor = () => {
    if (!editor?.id) { closeEditor(); return; }
    Alert.alert('오답 삭제', '이 오답을 삭제할까요? 첨부한 사진도 함께 삭제돼요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => {
        discardAddedFiles(editor);              // 저장 안 한 새 사진 정리
        app.deleteReviewNotes(editor.id);       // 노트 + 저장된 사진 정리(useAppState)
        setEditor(null);
      } },
    ]);
  };
  // 사진 추가 — 카메라(1장)/앨범(여러 장) → 리사이즈·압축 저장 → 파일명만 편집기에 추가
  const pickFrom = async (source) => {
    const remaining = MAX_ATTACH - (editor?.attachments?.length || 0);
    if (remaining <= 0) { app.showToastCustom(`사진은 최대 ${MAX_ATTACH}장까지예요`, 'paengi'); return; }
    try {
      let res;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert('권한 필요', '카메라 권한을 허용하면 문제를 찍어 첨부할 수 있어요.'); return; }
        res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
      } else {
        res = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'], quality: 1,
          allowsMultipleSelection: true, selectionLimit: remaining, // 앨범은 남은 장수만큼 여러 장 선택
        });
      }
      if (res.canceled) return;
      const assets = (res.assets || []).slice(0, remaining);
      const files = [];
      for (const a of assets) {
        if (!a?.uri) continue;
        const file = await saveImage(a.uri);
        if (file) files.push({ file });
      }
      if (files.length === 0) { app.showToastCustom('사진 저장에 실패했어요', 'paengi'); return; }
      setEditor(e => ({ ...e, attachments: [...(e.attachments || []), ...files] }));
      if ((res.assets || []).length > remaining) app.showToastCustom(`최대 ${MAX_ATTACH}장까지만 담았어요`, 'paengi');
    } catch {
      app.showToastCustom('사진을 불러오지 못했어요', 'paengi');
    }
  };
  const addPhoto = () => {
    Alert.alert('사진 추가', '오답 문제를 사진으로 남겨보세요', [
      { text: '카메라로 촬영', onPress: () => pickFrom('camera') },
      { text: '앨범에서 선택', onPress: () => pickFrom('album') },
      { text: '취소', style: 'cancel' },
    ]);
  };
  const removePhoto = (file) => {
    setEditor(e => {
      if (!e.origFiles.includes(file)) deleteFiles([file]); // 새로 추가했다 뺀 사진은 즉시 정리
      return { ...e, attachments: (e.attachments || []).filter(a => a.file !== file) };
    });
  };
  // 실수 삭제 방지 — × 탭 시 한 번 확인
  const confirmRemovePhoto = (file) => {
    Alert.alert('사진 삭제', '이 사진을 뺄까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => removePhoto(file) },
    ]);
  };

  const chapterSug = editor ? chapterSuggestions(notes, editor.subjectId) : [];
  const editorNote = editor?.id ? notes.find(n => n.id === editor.id) : null; // 복습 데이터 참조용(라이브)

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={{ flex: 1, backgroundColor: T.bg }}>
        {/* 헤더 */}
        <View style={[S.header, { borderColor: T.border, paddingTop: Platform.OS === 'ios' ? 54 : 16 }]}>
          {selectMode ? (
            <>
              <TouchableOpacity onPress={exitSelect} style={S.hBtn}><Text style={{ color: T.sub, fontSize: 15, fontWeight: '700' }}>취소</Text></TouchableOpacity>
              <Text style={{ color: T.text, fontSize: 16, fontWeight: '800' }}>{selected.length}개 선택</Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <TouchableOpacity onPress={selectAllVisible} style={S.hBtn}><Text style={{ color: T.accent, fontSize: 14, fontWeight: '700' }}>전체</Text></TouchableOpacity>
                <TouchableOpacity onPress={deleteSelected} style={S.hBtn}><Text style={{ color: DANGER, fontSize: 14, fontWeight: '800' }}>삭제</Text></TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <TouchableOpacity onPress={onClose} style={S.hBtn}><Ionicons name="chevron-back" size={24} color={T.text} /></TouchableOpacity>
              <Text style={{ color: T.text, fontSize: 17, fontWeight: '800' }}>오답노트</Text>
              <View style={{ flexDirection: 'row', gap: 2 }}>
                {notes.length > 0 && (
                  <TouchableOpacity onPress={() => startSelect()} style={S.hBtn}><Ionicons name="checkmark-circle-outline" size={22} color={T.sub} /></TouchableOpacity>
                )}
                <TouchableOpacity onPress={openNew} style={S.hBtn}><Ionicons name="add" size={26} color={T.accent} /></TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* 과목 필터 칩 */}
        {notes.length > 0 && (
          <View style={{ borderBottomWidth: 1, borderColor: T.border }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}>
              {subjectChips.map(c => {
                const active = filterSubject === c.key;
                return (
                  <TouchableOpacity key={c.key} onPress={() => setFilterSubject(c.key)}
                    style={[S.chip, { borderColor: active ? T.accent : T.border, backgroundColor: active ? T.accent + '18' : T.card }]}>
                    {c.color && <View style={[S.chipDot, { backgroundColor: c.color }]} />}
                    <Text style={{ fontSize: 13, fontWeight: active ? '800' : '600', color: active ? T.accent : T.sub }}>{c.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* 정렬 + 복습 필요 필터 */}
        {notes.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderColor: T.border }}>
            <TouchableOpacity onPress={() => setSortMode(m => m === 'recent' ? 'review' : 'recent')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="swap-vertical" size={14} color={T.sub} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: T.sub }}>{sortMode === 'recent' ? '최신순' : '안 본 순'}</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={() => setReviewOnly(v => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: reviewOnly ? T.accent : T.border, backgroundColor: reviewOnly ? T.accent + '18' : T.card }}>
              <Ionicons name={reviewOnly ? 'checkbox' : 'square-outline'} size={13} color={reviewOnly ? T.accent : T.sub} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: reviewOnly ? T.accent : T.sub }}>복습 필요만</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 본문 */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 60 }}>
          {notes.length === 0 && (
            <View style={{ alignItems: 'center', paddingTop: 80 }}>
              <Ionicons name="reader-outline" size={44} color={T.sub} />
              <Text style={{ color: T.text, fontSize: 15, fontWeight: '700', marginTop: 12 }}>오답노트가 비어 있어요</Text>
              <Text style={{ color: T.sub, fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 19 }}>
                할 일의 메모를 '오답노트로 보내기'로 옮기거나{'\n'}오른쪽 위 + 로 직접 기록해보세요.
              </Text>
            </View>
          )}
          {notes.length > 0 && groups.length === 0 && (
            <Text style={{ color: T.sub, fontSize: 13, textAlign: 'center', paddingTop: 40 }}>이 과목에는 오답이 없어요.</Text>
          )}
          {groups.map(g => (
            <View key={String(g.subjectId)} style={{ marginBottom: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: g.subjectColor || T.border }} />
                <Text style={{ fontSize: 15, fontWeight: '800', color: T.text }}>{g.subjectLabel}</Text>
                {g.deletedSubject && <Text style={{ fontSize: 11, color: T.sub }}>(삭제된 과목)</Text>}
                <Text style={{ fontSize: 12, color: T.sub }}>{g.count}</Text>
              </View>
              {g.chapters.map(ch => {
                const ckey = `${g.subjectId}|${ch.raw}`;
                const isCollapsed = collapsed[ckey];
                return (
                  <View key={ckey} style={{ marginBottom: 8 }}>
                    <TouchableOpacity onPress={() => setCollapsed(p => ({ ...p, [ckey]: !p[ckey] }))}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4, marginLeft: 2 }}>
                      <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={14} color={T.sub} />
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: T.sub }}>{ch.name}</Text>
                      <Text style={{ fontSize: 11, color: T.sub }}>· {ch.notes.length}</Text>
                    </TouchableOpacity>
                    {!isCollapsed && ch.notes.map(n => {
                      const bar = n.color || g.subjectColor || T.border;
                      const sel = isSel(n.id);
                      const mastered = !!n.mastered;
                      return (
                        <TouchableOpacity key={n.id} activeOpacity={0.7}
                          onPress={() => selectMode ? toggleSelect(n.id) : openEdit(n)}
                          onLongPress={() => !selectMode && startSelect(n.id)}
                          style={[S.card, { backgroundColor: T.card, borderColor: sel ? T.accent : T.border }, mastered && { opacity: 0.6 }]}>
                          <View style={[S.cardBar, { backgroundColor: bar }]} />
                          <View style={{ flex: 1 }}>
                            {!!n.title && <Text style={{ fontSize: 14, fontWeight: '700', color: T.text }} numberOfLines={2}>{n.title}</Text>}
                            {!!n.body && <Text style={{ fontSize: 12.5, color: T.sub, marginTop: n.title ? 3 : 0, lineHeight: 18 }} numberOfLines={3}>{n.body}</Text>}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}>
                              {mastered ? (
                                <><Ionicons name="ribbon-outline" size={11} color={MASTERED} /><Text style={{ fontSize: 11, fontWeight: '700', color: MASTERED }}>마스터 완료</Text></>
                              ) : n.lastReviewedAt ? (
                                <Text style={{ fontSize: 11, color: T.sub }}>복습 {n.reviewCount || 0}회 · {reviewedAgo(n.lastReviewedAt)}</Text>
                              ) : (
                                <Text style={{ fontSize: 11, color: T.sub }}>복습 안 함</Text>
                              )}
                            </View>
                          </View>
                          {!selectMode && n.attachments?.length > 0 && (
                            <View style={{ marginLeft: 8 }}>
                              <Image source={{ uri: resolveUri(n.attachments[0].file) }} style={{ width: 42, height: 42, borderRadius: 7, backgroundColor: T.bg }} />
                              {n.attachments.length > 1 && (
                                <View style={S.thumbBadge}><Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>{n.attachments.length}</Text></View>
                              )}
                            </View>
                          )}
                          {selectMode ? (
                            <Ionicons name={sel ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={sel ? T.accent : T.sub} style={{ marginLeft: 8 }} />
                          ) : !mastered ? (
                            <TouchableOpacity onPress={() => Alert.alert('복습 완료', '이 오답을 복습 1회로 기록할까요?', [
                              { text: '취소', style: 'cancel' },
                              { text: '복습 완료', onPress: () => { app.markReviewed(n.id); app.showToastCustom('복습 체크!', 'toru'); } },
                            ])}
                              style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, backgroundColor: T.accent + '12', marginLeft: 8 }}>
                              <Ionicons name="checkmark-done" size={15} color={T.accent} />
                              <Text style={{ fontSize: 10, fontWeight: '800', color: T.accent, marginTop: 1 }}>복습</Text>
                            </TouchableOpacity>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>

        {/* 편집기 */}
        <Modal visible={!!editor} animationType="slide" transparent onRequestClose={closeEditor}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
            <View style={[S.sheet, { backgroundColor: T.bg, flexShrink: 1 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <TouchableOpacity onPress={closeEditor}><Text style={{ color: T.sub, fontSize: 15, fontWeight: '700' }}>닫기</Text></TouchableOpacity>
                <Text style={{ color: T.text, fontSize: 16, fontWeight: '800' }}>{editor?.id ? '오답 수정' : '새 오답'}</Text>
                <TouchableOpacity onPress={saveEditor}><Text style={{ color: T.accent, fontSize: 15, fontWeight: '800' }}>저장</Text></TouchableOpacity>
              </View>
              {editor && (
                <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" nestedScrollEnabled showsVerticalScrollIndicator style={{ maxHeight: sheetScrollMax, flexShrink: 1 }}>
                  <TextInput value={editor.title} onChangeText={t => setEditor(e => ({ ...e, title: t }))}
                    placeholder="제목 (예: 이차함수 판별식)" placeholderTextColor={T.sub}
                    style={[S.input, { color: T.text, borderColor: T.border, backgroundColor: T.card, fontWeight: '700' }]} />
                  <TextInput value={editor.body} onChangeText={t => setEditor(e => ({ ...e, body: t }))}
                    placeholder="내용 · 오답 이유 · 기억할 것" placeholderTextColor={T.sub} multiline
                    style={[S.input, { color: T.text, borderColor: T.border, backgroundColor: T.card, minHeight: 100, textAlignVertical: 'top' }]} />

                  <Text style={[S.lbl, { color: T.sub }]}>사진 (선택 · 최대 {MAX_ATTACH}장)</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                    {(editor.attachments || []).map(a => (
                      <View key={a.file} style={{ position: 'relative' }}>
                        <TouchableOpacity activeOpacity={0.8} onPress={() => setViewer(resolveUri(a.file))}>
                          <Image source={{ uri: resolveUri(a.file) }} style={S.thumb} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => confirmRemovePhoto(a.file)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          style={S.thumbX}>
                          <Ionicons name="close" size={13} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    ))}
                    {(editor.attachments || []).length < MAX_ATTACH && (
                      <TouchableOpacity onPress={addPhoto} style={[S.thumb, S.thumbAdd, { borderColor: T.border, backgroundColor: T.card }]}>
                        <Ionicons name="camera-outline" size={22} color={T.sub} />
                        <Text style={{ fontSize: 10, color: T.sub, marginTop: 2 }}>추가</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={{ fontSize: 11, color: T.sub, marginBottom: 10, lineHeight: 15 }}>
                    사진은 이 기기에만 저장돼요. 백업 파일이나 기기를 바꿀 때는 함께 옮겨지지 않아요.
                  </Text>

                  <Text style={[S.lbl, { color: T.sub }]}>과목</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                    <TouchableOpacity onPress={() => setEditor(e => ({ ...e, subjectId: null }))}
                      style={[S.chip, { borderColor: editor.subjectId == null ? T.accent : T.border, backgroundColor: editor.subjectId == null ? T.accent + '18' : T.card }]}>
                      <Text style={{ fontSize: 13, color: editor.subjectId == null ? T.accent : T.sub, fontWeight: '700' }}>{UNCATEGORIZED}</Text>
                    </TouchableOpacity>
                    {subjects.map(s => {
                      const a = editor.subjectId === s.id;
                      return (
                        <TouchableOpacity key={s.id} onPress={() => setEditor(e => ({ ...e, subjectId: s.id }))}
                          style={[S.chip, { borderColor: a ? T.accent : T.border, backgroundColor: a ? T.accent + '18' : T.card }]}>
                          <View style={[S.chipDot, { backgroundColor: s.color }]} />
                          <Text style={{ fontSize: 13, color: a ? T.accent : T.sub, fontWeight: '700' }}>{s.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={[S.lbl, { color: T.sub }]}>챕터 (선택)</Text>
                  <TextInput value={editor.chapter} onChangeText={t => setEditor(e => ({ ...e, chapter: t }))}
                    placeholder="예: 3단원 · 문법 · 오답 유형" placeholderTextColor={T.sub}
                    style={[S.input, { color: T.text, borderColor: T.border, backgroundColor: T.card }]} />
                  {chapterSug.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                      {chapterSug.map(c => (
                        <TouchableOpacity key={c} onPress={() => setEditor(e => ({ ...e, chapter: c }))}
                          style={[S.chip, { borderColor: T.border, backgroundColor: T.surface2 }]}>
                          <Text style={{ fontSize: 12, color: T.sub }}>{c}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <Text style={[S.lbl, { color: T.sub }]}>강조 색 (선택)</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10, alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => setEditor(e => ({ ...e, color: null }))}
                      style={[S.colorDot, { borderColor: editor.color == null ? T.accent : T.border, backgroundColor: T.card, alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name="ban-outline" size={16} color={T.sub} />
                    </TouchableOpacity>
                    {NOTE_COLORS.map(c => (
                      <TouchableOpacity key={c} onPress={() => setEditor(e => ({ ...e, color: c }))}
                        style={[S.colorDot, { backgroundColor: c, borderColor: editor.color === c ? T.text : 'transparent', borderWidth: editor.color === c ? 3 : 2 }]} />
                    ))}
                  </View>

                  {editorNote && (
                    <View style={{ marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderColor: T.border }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity onPress={() => { app.markReviewed(editorNote.id); app.showToastCustom('복습 체크!', 'toru'); }}
                          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11, borderRadius: 10, backgroundColor: T.accent + '15', borderWidth: 1, borderColor: T.accent + '55' }}>
                          <Ionicons name="checkmark-done" size={16} color={T.accent} />
                          <Text style={{ fontSize: 14, fontWeight: '800', color: T.accent }}>복습 완료</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => app.toggleMastered(editorNote.id)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: editorNote.mastered ? MASTERED : T.border, backgroundColor: editorNote.mastered ? MASTERED + '18' : T.card }}>
                          <Ionicons name={editorNote.mastered ? 'ribbon' : 'ribbon-outline'} size={16} color={editorNote.mastered ? MASTERED : T.sub} />
                          <Text style={{ fontSize: 14, fontWeight: '800', color: editorNote.mastered ? MASTERED : T.sub }}>마스터</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8 }}>
                        <Text style={{ fontSize: 11.5, color: T.sub }}>
                          {editorNote.lastReviewedAt
                            ? `복습 ${editorNote.reviewCount || 0}회 · 마지막 ${reviewedAgo(editorNote.lastReviewedAt)}`
                            : '아직 복습하지 않았어요'}
                        </Text>
                        {(editorNote.reviewCount || 0) > 0 && (
                          <TouchableOpacity onPress={() => app.unmarkReviewed(editorNote.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                            <Text style={{ fontSize: 11.5, color: DANGER, fontWeight: '700' }}>복습 취소 −1</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  )}

                  {editor.id && (
                    <TouchableOpacity onPress={deleteFromEditor} style={{ alignSelf: 'center', paddingVertical: 10, marginTop: 4 }}>
                      <Text style={{ color: DANGER, fontSize: 14, fontWeight: '700' }}>이 오답 삭제</Text>
                    </TouchableOpacity>
                  )}
                </ScrollView>
              )}
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* 사진 전체보기 */}
        <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
          <TouchableOpacity activeOpacity={1} onPress={() => setViewer(null)}
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' }}>
            {viewer && <Image source={{ uri: viewer }} style={{ width: '92%', height: '78%' }} resizeMode="contain" />}
            <Text style={{ color: '#fff', position: 'absolute', bottom: 44, fontSize: 13, opacity: 0.8 }}>탭하여 닫기</Text>
          </TouchableOpacity>
        </Modal>
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingBottom: 12, borderBottomWidth: 1 },
  hBtn: { padding: 8, minWidth: 40, alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 11, paddingLeft: 8, borderRadius: 12, borderWidth: 1, marginBottom: 6 },
  cardBar: { width: 4, alignSelf: 'stretch', borderRadius: 2, marginRight: 10 },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 32 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 8 },
  lbl: { fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 4 },
  colorDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2 },
  thumb: { width: 72, height: 72, borderRadius: 8 },
  thumbAdd: { borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  thumbX: { position: 'absolute', top: -6, right: -6, backgroundColor: DANGER, borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  thumbBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#333', borderRadius: 8, minWidth: 16, height: 16, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
});
