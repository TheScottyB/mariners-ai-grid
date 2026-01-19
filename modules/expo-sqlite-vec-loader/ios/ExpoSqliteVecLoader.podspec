require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoSqliteVecLoader'
  s.version        = package['version'] || '1.0.0'
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platform       = :ios, '13.0'
  s.swift_version  = '5.4'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'ExpoSQLite'
  
  # We rely on the app to link the sqlite-vec binary via the config plugin
  # s.dependency 'sqlite-vec'

  # Force search paths to find ExpoSQLite's vendored headers if they exist
  s.pod_target_xcconfig = {
    'HEADER_SEARCH_PATHS' => '"$(PODS_ROOT)/Headers/Public/ExpoSQLite" "$(PODS_ROOT)/Headers/Public/ExpoModulesCore"'
  }

  # Swift/ObjC source files
  s.source_files = "**/*.{h,m,swift}"
  s.public_header_files = "**/*.h"
end
