/**
 * 从模型的自由文本里抠出 JSON。
 *
 * 模型经常套 ```json 围栏、或者说两句"结果如下"再给对象；
 * 这里只取最外层那一对花括号，别的都不认。
 */
export function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('模型没给出 JSON');
  }
  return text.slice(start, end + 1);
}
