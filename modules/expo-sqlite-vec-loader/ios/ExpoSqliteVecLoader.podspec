Pod::Spec.new do |s|
  s.name           = 'ExpoSqliteVecLoader'
  s.version        = '1.0.0'
  s.summary        = 'Loader for sqlite-vec'
  s.description    = 'Loader for sqlite-vec extension'
  s.author         = 'Mariner AI'
  s.homepage       = 'https://mariners.ai'
  s.platform       = :ios, '13.4'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'ExpoSQLite'
  
  # We rely on the app to link the sqlite-vec binary via the config plugin
  # s.dependency 'sqlite-vec'

  # Swift/ObjC source files
  s.source_files = '**/*.{h,m,swift}'
end