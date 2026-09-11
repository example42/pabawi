require 'bundler/setup'
require 'winrm-fs'
require 'digest'
require 'fileutils'
require 'logger'
require 'tmpdir'

raise 'Patched RubyZip is not active' unless Gem.loaded_specs.fetch('rubyzip').version.to_s == '3.6.0'
raise 'Patched WinRM FS is not active' unless Gem.loaded_specs.fetch('winrm-fs').version.to_s == '1.3.5.pabawi.1'

logger = Logger.new(File::NULL)
Dir.mktmpdir('pabawi-winrm-') do |root|
  source = File.join(root, 'source')
  FileUtils.mkdir_p(File.join(source, 'nested'))
  files = { 'plain.txt' => 'hello', '.hidden' => 'hidden', 'nested/caffè.txt' => "binary\x00\xFF".b, 'empty' => '' }
  files.each { |name, content| File.binwrite(File.join(source, name), content) }

  # Exercise the actual WinRM directory-upload preparation, including SHA1 and zip metadata.
  transporter = WinRM::FS::Core::FileTransporter.new(Struct.new(:logger).new(logger))
  uploads = transporter.send(:make_files_hash, [source], 'C:\\Temp')
  raise 'Directory upload was not prepared' unless uploads.length == 1
  digest, upload = uploads.first
  archive = upload.fetch('src_zip')
  raise 'Upload digest mismatch' unless Digest::SHA1.file(archive).hexdigest == digest
  raise 'Upload size mismatch' unless upload.fetch('size') == File.size(archive)

  Zip::File.open(archive) do |zip|
    raise "Archive entry set changed: #{zip.entries.map(&:name).inspect}" unless zip.entries.map { |entry| entry.name.b }.sort == files.keys.map(&:b).sort
    files.each do |name, content|
      raise "Archive content changed: #{name}" unless zip.read(name.b).b == content.b
      raise "Archive timestamp changed: #{name}" unless zip.find_entry(name.b).time.year == 2000
      raise "UTF-8 filename flag missing: #{name}" unless zip.find_entry(name.b).gp_flags & 0x800 != 0
    end
    destination = File.join(root, 'extracted')
    FileUtils.mkdir_p(destination)
    zip.each do |entry|
      FileUtils.mkdir_p(File.dirname(File.join(destination, entry.name)))
      entry.extract(destination_directory: destination)
    end
    files.each do |name, content|
      raise "Extraction changed: #{name}" unless File.binread(File.join(destination, name)) == content.b
    end
  end
  upload.fetch('zip_io').unlink
  puts 'PASS: WinRM directory upload preparation and archive round trip'

  # CVE-2026-85396 used a sibling directory sharing the allowed destination prefix.
  destination = File.join(root, 'upload')
  sibling = File.join(root, 'upload_backup')
  FileUtils.mkdir_p([destination, sibling])
  malicious = File.join(root, 'malicious.zip')
  Zip::OutputStream.open(malicious) do |zip|
    zip.put_next_entry('../upload_backup/owned.txt')
    zip.write('outside')
  end
  Zip::File.open(malicious) do |zip|
    zip.first.extract(destination_directory: destination)
  end
  raise 'Traversal wrote outside the destination' if File.exist?(File.join(sibling, 'owned.txt'))
  puts 'PASS: sibling-directory archive traversal rejected'
end
