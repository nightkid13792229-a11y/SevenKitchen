/**
 * 起草循环的「这次工具调用算不算有新信息」判定。
 *
 * 只靠「有没有写字段 / 有没有读到没见过的来源 id」会把**只读探索**误判成原地打转：
 * 线上 2026-10-26 的草稿 `80a515f9-…` 里，`searchNames` 把命中清单里的全部 id 都
 * 报成「已读」，随后真正 `getRecord` 读其中三条，被判成连续三次没有新进展而停止。
 *
 * 现在把调用本身也当成信号：**工具名 + 参数指纹**没出现过就是新探索。指纹由调用方
 * 用 `hashDraftPayload` 生成，键顺序不同不会产生两个指纹。
 *
 * 纯判定：不读环境、不写日志，副作用只有向两个 `Set` 里记下已经见过的值。
 */
export interface AgentProgressInput {
  sourceRecordIds?: readonly string[];
  writtenFieldPaths?: readonly string[];
}

/**
 * @returns 本次调用是否带来了此前不知道的信息（新调用 / 新来源 / 写了字段）。
 */
export function trackAgentProgress(input: {
  progress: AgentProgressInput | undefined;
  signature: string;
  seenSignatures: Set<string>;
  seenSourceRecordIds: Set<string>;
}): boolean {
  const { progress, signature, seenSignatures, seenSourceRecordIds } = input;
  let progressed = false;

  // 规则 1：同一个工具、同一组参数第一次出现，本身就是新探索。
  if (!seenSignatures.has(signature)) {
    seenSignatures.add(signature);
    progressed = true;
  }

  // 规则 2：读到了此前没读过的来源记录。
  for (const sourceRecordId of progress?.sourceRecordIds ?? []) {
    if (!seenSourceRecordIds.has(sourceRecordId)) {
      seenSourceRecordIds.add(sourceRecordId);
      progressed = true;
    }
  }

  // 规则 3：新增或改变了字段。
  if ((progress?.writtenFieldPaths?.length ?? 0) > 0) {
    progressed = true;
  }

  return progressed;
}
