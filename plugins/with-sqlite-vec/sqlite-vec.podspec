Pod::Spec.new do |s|
  s.name           = 'sqlite-vec'
  s.version        = '0.1.6'
  s.summary        = 'Vector search for SQLite'
  s.description    = 'A vector search extension for SQLite, built from source.'
  s.author         = 'Mariner AI'
  s.homepage       = 'https://mariners.ai'
  s.license        = { :type => 'MIT' }
  s.platform       = :ios, '13.0'
  s.source         = { :git => '' } # Dummy source for local pod
  
  # Build from the C amalgamation
  s.source_files = 'vendor/sqlite-vec.c', 'vendor/sqlite-vec.h'
  
  # Link against ExpoSQLite headers to pick up symbol renames (exsqlite3_)
  s.dependency 'ExpoSQLite'
  s.pod_target_xcconfig = {
    'HEADER_SEARCH_PATHS' => '"$(PODS_ROOT)/Headers/Public/ExpoSQLite" "$(PODS_ROOT)/Headers/Public/ExpoModulesCore"',
    'OTHER_LDFLAGS' => '-lm'
  }
end
