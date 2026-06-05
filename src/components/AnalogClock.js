import React, { useState, useEffect } from 'react';
import Svg, { Circle, Line, Polygon, Text as SvgText, G } from 'react-native-svg';

const NUMBERS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export default function AnalogClock({ size = 240 }) {
  const [now, setNow] = useState(() => new Date());
  const timerRef = React.useRef(null);

  useEffect(() => {
    const tick = () => {
      setNow(new Date());
      const msToNextSec = 1000 - (Date.now() % 1000);
      timerRef.current = setTimeout(tick, msToNextSec);
    };
    const msToNextSec = 1000 - (Date.now() % 1000);
    timerRef.current = setTimeout(tick, msToNextSec);
    return () => clearTimeout(timerRef.current);
  }, []);

  const cx = Math.floor(size / 2);
  const cy = Math.floor(size / 2);
  const rBezel = Math.floor(size / 2) - 3;  // 베젤 외곽
  const r = rBezel - 9;                      // 흰 시계판 반지름 (모든 계산 기준)

  const hrs = now.getHours() % 12;
  const min = now.getMinutes();
  const sec = now.getSeconds();

  const toXY = (angleDeg, len) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + len * Math.cos(rad), y: cy + len * Math.sin(rad) };
  };

  const secDeg = sec * 6;
  const minDeg = min * 6 + sec * 0.1;
  const hrDeg = hrs * 30 + min * 0.5;

  // 마름모형 시침/분침 포인트 (12시 방향 기준, G rotate로 회전)
  const handPoints = (tipLen, tailLen, width) => {
    const wideY = tailLen * 0.4;
    return [
      `${cx},${cy - tipLen}`,
      `${cx + width / 2},${cy + wideY}`,
      `${cx},${cy + tailLen}`,
      `${cx - width / 2},${cy + wideY}`,
    ].join(' ');
  };

  const numR = r - 21;
  const fontSize = Math.round(size * 0.068);

  return (
    <Svg width={size} height={size}>
      {/* 베젤 (어두운 외곽 링) */}
      <Circle cx={cx} cy={cy} r={rBezel} fill="#444" stroke="#222" strokeWidth={2} />
      {/* 베젤 안쪽 하이라이트 (살짝 밝은 내곽선 — 입체감) */}
      <Circle cx={cx} cy={cy} r={r + 1} fill="none" stroke="#666" strokeWidth={1} />

      {/* 흰 시계판 */}
      <Circle cx={cx} cy={cy} r={r} fill="white" stroke="#ccc" strokeWidth={1} />

      {/* 눈금 */}
      {Array.from({ length: 60 }, (_, i) => {
        const isHour = i % 5 === 0;
        const outer = toXY(i * 6, r - 3);
        const inner = toXY(i * 6, r - (isHour ? 12 : 6));
        return (
          <Line key={i}
            x1={outer.x} y1={outer.y}
            x2={inner.x} y2={inner.y}
            stroke={isHour ? '#111' : '#bbb'}
            strokeWidth={isHour ? 2.5 : 1}
          />
        );
      })}

      {/* 숫자 1~12 */}
      {NUMBERS.map((num, i) => {
        const pos = toXY(i * 30, numR);
        return (
          <SvgText key={num}
            x={pos.x} y={pos.y}
            textAnchor="middle"
            alignmentBaseline="central"
            fontSize={fontSize}
            fontWeight="700"
            fill="#111"
          >
            {num}
          </SvgText>
        );
      })}

      {/* 시침 (마름모형) */}
      <G transform={`rotate(${hrDeg}, ${cx}, ${cy})`}>
        <Polygon points={handPoints(r * 0.52, r * 0.14, 10)} fill="#111" />
      </G>

      {/* 분침 (마름모형) */}
      <G transform={`rotate(${minDeg}, ${cx}, ${cy})`}>
        <Polygon points={handPoints(r * 0.77, r * 0.14, 6)} fill="#111" />
      </G>

      {/* 초침 */}
      <Line
        x1={toXY(secDeg + 180, r * 0.2).x} y1={toXY(secDeg + 180, r * 0.2).y}
        x2={toXY(secDeg, r * 0.85).x} y2={toXY(secDeg, r * 0.85).y}
        stroke="#E84047" strokeWidth={1.5} strokeLinecap="round"
      />

      {/* 중심점 */}
      <Circle cx={cx} cy={cy} r={5.5} fill="#E84047" />
      <Circle cx={cx} cy={cy} r={2.5} fill="white" />
    </Svg>
  );
}
