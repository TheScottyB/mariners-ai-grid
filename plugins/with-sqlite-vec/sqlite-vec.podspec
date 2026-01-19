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

  # Use pre-compiled static library (avoids expo-sqlite symbol prefix conflicts)
  s.vendored_libraries = 'vendor/ios/libsqlite_vec.a'

  # Link C++ standard library
  s.library = 'c++'
  s.xcconfig = { 'OTHER_LDFLAGS' => '-force_load "$(PODS_TARGET_SRCROOT)/vendor/ios/libsqlite_vec.a"' }
end
