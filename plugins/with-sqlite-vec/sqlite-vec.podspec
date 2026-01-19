Pod::Spec.new do |s|
  s.name         = "sqlite-vec"
  s.version      = "0.1.6"
  s.summary      = "Vector search for SQLite"
  s.description  = <<-DESC
    sqlite-vec is a SQLite extension for vector search.
  DESC
  s.homepage     = "https://github.com/asg017/sqlite-vec"
  s.license      = "MIT"
  s.author       = { "Alex Garcia" => "alex@asg.com" }
  s.platform     = :ios, "13.0"
  s.source       = { :git => "https://github.com/asg017/sqlite-vec.git", :tag => "v#{s.version}" }

  # Use XCFramework for proper multi-arch support (Apple Silicon Simulators)
  s.vendored_frameworks = 'vendor/ios/sqlite_vec.xcframework'
  # s.vendored_libraries = 'vendor/ios/libsqlite_vec.a' # Removed
  # s.preserve_paths = 'vendor/ios/libsqlite_vec.a' # Removed
  
  # Auto-init helper
  s.source_files = 'sqlite-vec-auto-init.c'

  # Force load still helps ensure the auto-init file is linked
  # But for XCFramework, we might not need -force_load for the framework itself if it's dynamic?
  # sqlite-vec static builds are usually static frameworks.
  # We should force load the framework to be safe.
  s.pod_target_xcconfig = {
    # 'OTHER_LDFLAGS' => '-force_load "$(PODS_TARGET_SRCROOT)/vendor/ios/libsqlite_vec.a"', # OLD
    # No need to force load the framework explicitly if source_files references symbols in it? 
    # Actually, we likely still need it. But force_load for framework path is different.
    # Usually: -force_load path/to/framework/binary
    # Let's try without first, as XCFramework handling in CocoaPods is smarter.
    'HEADER_SEARCH_PATHS' => '"$(PODS_ROOT)/Headers/Public/ExpoSQLite"'
  }
  
  # Ensure library is loaded - use static frameworks for proper linking
  s.static_framework = true
  s.library = 'c++'
  
  s.dependency 'ExpoSQLite'
end
