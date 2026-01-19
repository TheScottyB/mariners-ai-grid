#
# sqlite-vec.podspec
# Cocoapods podspec for bundling sqlite-vec static library
#
# Used by expo-build-properties extraPods configuration
#

Pod::Spec.new do |s|
  s.name         = "sqlite-vec"
  s.version      = "0.1.6"
  s.summary      = "A vector search SQLite extension for similarity search"
  s.description  = <<-DESC
    sqlite-vec is a SQLite extension for vector similarity search.
    Used in Mariner's AI Grid for atmospheric pattern matching.
  DESC
  s.homepage     = "https://github.com/asg017/sqlite-vec"
  s.license      = { :type => "MIT", :file => "LICENSE" }
  s.author       = { "Alex Garcia" => "alexsebastian.garcia@gmail.com" }
  s.source       = { :http => "https://github.com/asg017/sqlite-vec/releases/download/v#{s.version}/sqlite-vec-#{s.version}-ios.tar.gz" }

  s.platform     = :ios, "15.1"
  s.requires_arc = false

  # Use vendored static library
  s.vendored_libraries = "vendor/ios/libsqlite_vec.a"
  s.source_files = "vendor/ios/sqlite-vec.h"
  s.public_header_files = "vendor/ios/sqlite-vec.h"

  # Required frameworks
  s.frameworks = "Foundation"

  # Build settings for SQLite extension support
  s.pod_target_xcconfig = {
    "OTHER_LDFLAGS" => "-lsqlite_vec",
    "HEADER_SEARCH_PATHS" => "$(PODS_TARGET_SRCROOT)/vendor/ios",
    "LIBRARY_SEARCH_PATHS" => "$(PODS_TARGET_SRCROOT)/vendor/ios"
  }

  s.user_target_xcconfig = {
    "OTHER_LDFLAGS" => "-lsqlite_vec",
    "CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES" => "YES"
  }
end
