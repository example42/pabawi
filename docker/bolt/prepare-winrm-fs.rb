require 'digest'
require 'fileutils'
require 'rubygems/package'

archive = ARGV.fetch(0)
expected = '0d2cdd9e1fb6fc8d01f56a32dce41d98ae6eefb481937ed0e058faa0cd0c693d'
abort 'winrm-fs archive checksum mismatch' unless Digest::SHA256.file(archive).hexdigest == expected

package = Gem::Package.new(archive)
destination = File.expand_path('vendor/winrm-fs')
FileUtils.mkdir_p(destination)
package.extract_files(destination)

source = File.join(destination, 'lib/winrm-fs/core/tmp_zip.rb')
original = File.read(source)
before = <<'RUBY'
            nil, nil, nil, nil, nil, nil,
            ::Zip::DOSTime.new(2000)
RUBY
after = "            time: ::Zip::DOSTime.new(2000), compression_level: Zlib::BEST_COMPRESSION\n"
abort 'Unexpected winrm-fs archive API call' unless original.scan(before).length == 1
File.write(source, original.sub(before, after))

# A distinct local version makes the patched dependency visible in the lock and SBOM.
spec = package.spec
spec.version = '1.3.5.pabawi.1'
spec.dependencies.delete_if { |dependency| dependency.name == 'rubyzip' }
spec.add_runtime_dependency('rubyzip', '~> 3.6')
File.write(File.join(destination, 'winrm-fs.gemspec'), spec.to_ruby)
