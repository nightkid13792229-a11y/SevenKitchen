const COS = require('cos-nodejs-sdk-v5');
const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY });
const { COS_BUCKET: Bucket, COS_REGION: Region } = process.env;
(async () => {
  for (const Prefix of ['medical-reports/temp/', 'checkup-reports/temp/']) {
    const r = await new Promise((res, rej) =>
      cos.getBucket({ Bucket, Region, Prefix, MaxKeys: 1000 }, (e, d) => (e ? rej(e) : res(d))));
    const items = (r.Contents || [])
      .map((c) => ({ Key: c.Key, Size: Number(c.Size), t: c.LastModified }))
      .sort((a, b) => String(b.t).localeCompare(String(a.t)))
      .slice(0, 12);
    console.log('===', Prefix);
    items.forEach((i) => console.log(` ${i.t}  ${(i.Size / 1024).toFixed(0)}KB  ${i.Key}`));
  }
})().catch((e) => { console.error('失败:', e.message || e); process.exit(1); });
