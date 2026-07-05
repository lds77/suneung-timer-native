Pod::Spec.new do |s|
  s.name           = 'FocusShield'
  s.version        = '1.0.0'
  s.summary        = 'Focus app blocking via FamilyControls (Screen Time API)'
  s.description    = 'Blocks user-selected apps during focus sessions'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,mm,swift}'
end
