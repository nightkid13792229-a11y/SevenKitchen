/**
 * 测试COS上传功能
 */
import { TencentCosService } from './src/infrastructure/services/tencent-cos.service';
import { ConfigService } from '@nestjs/config';

const configService = new ConfigService();
const cosService = new TencentCosService(configService);

// 创建一个1x1像素的PNG图片（红色）
const pngImageData = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
  0x00, 0x00, 0x00, 0x0D, // IHDR length
  0x49, 0x48, 0x44, 0x52, // IHDR type
  0x00, 0x00, 0x00, 0x01, // Width: 1
  0x00, 0x00, 0x00, 0x01, // Height: 1
  0x08, 0x02, 0x00, 0x00, 0x00, // Bit depth: 8, Color type: 2 (RGB), etc.
  0x90, 0x77, 0x53, 0xDE, // CRC
  0x00, 0x00, 0x00, 0x0C, // IDAT length
  0x49, 0x44, 0x41, 0x54, // IDAT type
  0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, // Image data
  0x18, 0xDD, 0x8D, 0xB4, // CRC
  0x00, 0x00, 0x00, 0x00, // IEND length
  0x49, 0x45, 0x4E, 0x44, // IEND type
  0xAE, 0x42, 0x60, 0x82  // CRC
]);

console.log('='.repeat(60));
console.log('测试COS上传功能');
console.log('='.repeat(60));

console.log('\n检查环境变量:');
console.log('COS_SECRET_ID:', configService.get('COS_SECRET_ID') ? '✓ 已设置' : '✗ 未设置');
console.log('COS_SECRET_KEY:', configService.get('COS_SECRET_KEY') ? '✓ 已设置' : '✗ 未设置');
console.log('COS_BUCKET:', configService.get('COS_BUCKET') || '✗ 未设置');
console.log('COS_REGION:', configService.get('COS_REGION') || '✗ 未设置');

console.log('\n开始上传测试图片...');

cosService.uploadImage(pngImageData, 'test-upload.png', 'recipes/test')
  .then(result => {
    console.log('\n✓ 上传成功！');
    console.log('URL:', result.url);
    console.log('Key:', result.key);
    console.log('\n' + '='.repeat(60));
    process.exit(0);
  })
  .catch(error => {
    console.error('\n✗ 上传失败！');
    console.error('错误:', error.message);
    console.error('\n完整错误:', error);
    console.log('\n' + '='.repeat(60));
    process.exit(1);
  });
