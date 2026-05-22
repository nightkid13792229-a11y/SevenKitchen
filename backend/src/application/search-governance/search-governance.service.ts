import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  SearchAliasGroupStatus,
  SearchAliasRiskLevel,
  SearchAliasSuggestionAction,
  SearchAliasSuggestionStatus,
  SearchGovernanceDomain,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import { normalizeSearchText } from '../../domain/search-governance/search-text';

export interface CreateSearchAliasGroupInput {
  domain: SearchGovernanceDomain;
  canonicalTerm: string;
  aliases: string[];
  riskLevel?: SearchAliasRiskLevel;
  notes?: string | null;
}

export interface RecordSearchEventInput {
  domain: SearchGovernanceDomain;
  source: string;
  rawQuery: string;
  resultCount: number;
  selectedEntityType?: string | null;
  selectedEntityId?: string | null;
  selectedEntityName?: string | null;
  userId?: string | null;
}

type UpdateSearchAliasGroupInput = Partial<CreateSearchAliasGroupInput>;
type SearchGovernanceTransaction = Prisma.TransactionClient;
type NullableJsonInput =
  | Prisma.InputJsonValue
  | Prisma.NullableJsonNullValueInput;

export interface CreateSearchAliasSuggestionInput {
  domain: SearchGovernanceDomain;
  action: SearchAliasSuggestionAction;
  payload: Prisma.InputJsonValue;
  evidence?: Prisma.InputJsonValue;
  riskLevel?: SearchAliasRiskLevel;
  agentRationale?: string | null;
}

interface SearchAliasSuggestionPayload {
  canonicalTerm: string;
  aliases: string[];
}

interface SearchQueryLogForSuggestions {
  domain: SearchGovernanceDomain;
  rawQuery?: string | null;
  normalizedQuery?: string | null;
  resultCount?: number | null;
  selectedEntityName?: string | null;
}

interface SearchAliasGroupForSuggestions {
  domain: SearchGovernanceDomain;
  canonicalTerm: string;
  aliases?: string[] | null;
}

interface SearchAliasSuggestionForDedup {
  domain: SearchGovernanceDomain;
  action: SearchAliasSuggestionAction;
  payload: Prisma.JsonValue;
}

@Injectable()
export class SearchGovernanceService {
  constructor(private readonly prisma: PrismaService) {}

  async expandQuery(
    domain: SearchGovernanceDomain,
    rawQuery?: string | null,
  ): Promise<string[]> {
    const query = rawQuery?.trim() ?? '';
    const normalizedQuery = normalizeSearchText(query);

    if (!normalizedQuery) {
      return [];
    }

    const groups = await this.prisma.searchAliasGroup.findMany({
      where: { domain, status: 'ACTIVE' },
      orderBy: { canonicalTerm: 'asc' },
    });

    const expanded: string[] = [];
    const seen = new Set<string>();
    const addTerm = (term: string) => {
      const trimmed = term.trim();
      const normalized = normalizeSearchText(trimmed);
      if (!normalized || seen.has(normalized)) {
        return;
      }

      seen.add(normalized);
      expanded.push(trimmed);
    };

    addTerm(query);

    for (const group of groups) {
      const terms = [group.canonicalTerm, ...(group.aliases ?? [])];
      const matches = terms.some((term) => {
        const normalizedTerm = normalizeSearchText(term);
        return (
          normalizedTerm === normalizedQuery ||
          normalizedTerm.includes(normalizedQuery) ||
          normalizedQuery.includes(normalizedTerm)
        );
      });

      if (matches) {
        addTerm(group.canonicalTerm);
        for (const alias of group.aliases ?? []) {
          addTerm(alias);
        }
      }
    }

    return expanded;
  }

  async createAliasGroup(input: CreateSearchAliasGroupInput, userId?: string | null) {
    const canonicalTerm = input.canonicalTerm.trim();
    if (!normalizeSearchText(canonicalTerm)) {
      throw new BadRequestException('搜索别名组标准词不能为空');
    }

    const aliases = this.normalizeAliasList(input.aliases);

    return this.prisma.$transaction(
      async (tx: SearchGovernanceTransaction) => {
        await this.lockAliasDomain(tx, input.domain);
        await this.assertNoCanonicalTermConflict(
          tx,
          input.domain,
          canonicalTerm,
        );
        await this.assertNoActiveAliasConflict(
          tx,
          input.domain,
          canonicalTerm,
          aliases,
        );

        const group = await tx.searchAliasGroup.create({
          data: {
            domain: input.domain,
            canonicalTerm,
            aliases,
            riskLevel: input.riskLevel ?? 'LOW',
            notes: input.notes ?? null,
            createdBy: userId ?? null,
            updatedBy: userId ?? null,
          },
        });

        await tx.searchAliasAuditLog.create({
          data: {
            domain: input.domain,
            action: 'CREATE_ALIAS_GROUP',
            before: this.toNullableJsonInput(null),
            after: this.toNullableJsonInput(group),
            operatorId: userId ?? null,
          },
        });

        return group;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async recordSearchEvent(input: RecordSearchEventInput) {
    if (!normalizeSearchText(input.rawQuery)) {
      return null;
    }

    return this.prisma.searchQueryLog.create({
      data: {
        domain: input.domain,
        source: input.source,
        rawQuery: input.rawQuery,
        normalizedQuery: normalizeSearchText(input.rawQuery),
        resultCount: input.resultCount,
        selectedEntityType: input.selectedEntityType ?? null,
        selectedEntityId: input.selectedEntityId ?? null,
        selectedEntityName: input.selectedEntityName ?? null,
        userId: input.userId ?? null,
      },
    });
  }

  async listAliasGroups(params: {
    domain?: SearchGovernanceDomain;
    status?: SearchAliasGroupStatus;
  }) {
    return this.prisma.searchAliasGroup.findMany({
      where: {
        ...(params.domain ? { domain: params.domain } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
      orderBy: [{ domain: 'asc' }, { canonicalTerm: 'asc' }],
    });
  }

  async listSuggestions(params: {
    domain?: SearchGovernanceDomain;
    status?: SearchAliasSuggestionStatus;
  }) {
    return this.prisma.searchAliasSuggestion.findMany({
      where: {
        ...(params.domain ? { domain: params.domain } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createSuggestion(input: CreateSearchAliasSuggestionInput) {
    return this.prisma.searchAliasSuggestion.create({
      data: {
        domain: input.domain,
        action: input.action,
        payload: input.payload,
        evidence: input.evidence ?? {},
        riskLevel: input.riskLevel ?? 'MEDIUM',
        agentRationale: input.agentRationale ?? null,
      },
    });
  }

  async rejectSuggestion(id: string, reviewerId: string) {
    const suggestion = await this.prisma.searchAliasSuggestion.findUnique({
      where: { id },
    });
    if (!suggestion) {
      throw new NotFoundException('搜索建议不存在');
    }
    if (suggestion.status !== 'PENDING') {
      throw new BadRequestException('只能处理待处理建议');
    }

    return this.prisma.searchAliasSuggestion.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewerId,
        reviewedAt: new Date(),
      },
    });
  }

  async generateSuggestions(params: {
    domain?: SearchGovernanceDomain;
    days?: number;
  }) {
    const logs = await this.getQueryInsights(params);
    const deterministicSuggestions = buildDeterministicSuggestionsFromLogs(logs);
    if (deterministicSuggestions.length === 0) {
      return [];
    }

    const [activeAliasGroups, existingSuggestions] = await Promise.all([
      this.prisma.searchAliasGroup.findMany({
        where: {
          status: 'ACTIVE',
          ...(params.domain ? { domain: params.domain } : {}),
        },
      }),
      this.prisma.searchAliasSuggestion.findMany({
        where: {
          status: { in: ['PENDING', 'APPLIED'] },
          ...(params.domain ? { domain: params.domain } : {}),
        },
      }),
    ]);
    const suggestions = filterAlreadyRepresentedSuggestions(
      deterministicSuggestions,
      activeAliasGroups,
      existingSuggestions,
    );
    const persistedSuggestions = [];

    for (const suggestion of suggestions) {
      persistedSuggestions.push(await this.createSuggestion(suggestion));
    }

    return persistedSuggestions;
  }

  async approveSuggestion(id: string, reviewerId: string) {
    return this.prisma.$transaction(
      async (tx: SearchGovernanceTransaction) => {
        let suggestion = await tx.searchAliasSuggestion.findUnique({
          where: { id },
        });
        if (!suggestion) {
          throw new NotFoundException('搜索建议不存在');
        }
        if (suggestion.status !== 'PENDING') {
          throw new BadRequestException('只能审批待处理建议');
        }

        await this.lockAliasDomain(tx, suggestion.domain);
        suggestion = await tx.searchAliasSuggestion.findUnique({
          where: { id },
        });
        if (!suggestion) {
          throw new NotFoundException('搜索建议不存在');
        }
        if (suggestion.status !== 'PENDING') {
          throw new BadRequestException('只能审批待处理建议');
        }

        let aliasGroupMutated = false;

        try {
          if (suggestion.action === 'ADD_ALIAS') {
            const payload = this.parseSuggestionPayload(suggestion.payload, {
              requireAliases: true,
            });
            const existing = await tx.searchAliasGroup.findFirst({
              where: {
                domain: suggestion.domain,
                canonicalTerm: payload.canonicalTerm,
                status: 'ACTIVE',
              },
            });
            if (!existing) {
              throw new BadRequestException('目标别名组不存在');
            }

            const aliases = this.normalizeAliasList([
              ...(existing.aliases ?? []),
              ...payload.aliases,
            ]);

            await this.assertNoActiveAliasConflict(
              tx,
              suggestion.domain,
              existing.canonicalTerm,
              aliases,
              existing.id,
            );

            const group = await tx.searchAliasGroup.update({
              where: { id: existing.id },
              data: {
                aliases,
                updatedBy: reviewerId,
              },
            });
            aliasGroupMutated = true;

            await tx.searchAliasAuditLog.create({
              data: {
                domain: suggestion.domain,
                action: 'APPLY_SEARCH_ALIAS_SUGGESTION',
                before: this.toNullableJsonInput(existing),
                after: this.toNullableJsonInput(group),
                suggestionId: suggestion.id,
                operatorId: reviewerId,
              },
            });

            await tx.searchAliasSuggestion.update({
              where: { id },
              data: {
                status: 'APPLIED',
                reviewerId,
                reviewedAt: new Date(),
                appliedAt: new Date(),
              },
            });

            return group;
          }

          if (suggestion.action === 'CREATE_GROUP') {
            const payload = this.parseSuggestionPayload(suggestion.payload, {
              requireAliases: false,
            });
            await this.assertNoCanonicalTermConflict(
              tx,
              suggestion.domain,
              payload.canonicalTerm,
            );
            await this.assertNoActiveAliasConflict(
              tx,
              suggestion.domain,
              payload.canonicalTerm,
              payload.aliases,
            );

            const group = await tx.searchAliasGroup.create({
              data: {
                domain: suggestion.domain,
                canonicalTerm: payload.canonicalTerm,
                aliases: payload.aliases,
                riskLevel: suggestion.riskLevel,
                createdBy: reviewerId,
                updatedBy: reviewerId,
              },
            });
            aliasGroupMutated = true;

            await tx.searchAliasAuditLog.create({
              data: {
                domain: suggestion.domain,
                action: 'APPLY_SEARCH_ALIAS_SUGGESTION',
                before: this.toNullableJsonInput(null),
                after: this.toNullableJsonInput(group),
                suggestionId: suggestion.id,
                operatorId: reviewerId,
              },
            });

            await tx.searchAliasSuggestion.update({
              where: { id },
              data: {
                status: 'APPLIED',
                reviewerId,
                reviewedAt: new Date(),
                appliedAt: new Date(),
              },
            });

            return group;
          }

          return this.markSuggestionFailed(
            tx,
            id,
            reviewerId,
            `暂不支持自动应用 ${suggestion.action}`,
          );
        } catch (error) {
          if (aliasGroupMutated) {
            throw error;
          }

          return this.markSuggestionFailed(
            tx,
            id,
            reviewerId,
            this.getApprovalErrorMessage(error),
          );
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async updateAliasGroup(
    id: string,
    input: UpdateSearchAliasGroupInput,
    userId?: string | null,
  ) {
    return this.prisma.$transaction(
      async (tx: SearchGovernanceTransaction) => {
        const existing = await tx.searchAliasGroup.findUnique({ where: { id } });
        if (!existing) {
          throw new NotFoundException('搜索别名组不存在');
        }

        const domain = input.domain ?? existing.domain;
        const canonicalTerm = (
          input.canonicalTerm ?? existing.canonicalTerm
        ).trim();
        if (!normalizeSearchText(canonicalTerm)) {
          throw new BadRequestException('搜索别名组标准词不能为空');
        }

        const aliases =
          input.aliases === undefined
            ? existing.aliases
            : this.normalizeAliasList(input.aliases);

        await this.lockAliasDomain(tx, domain);
        await this.assertNoCanonicalTermConflict(
          tx,
          domain,
          canonicalTerm,
          id,
        );
        await this.assertNoActiveAliasConflict(
          tx,
          domain,
          canonicalTerm,
          aliases,
          id,
        );

        const group = await tx.searchAliasGroup.update({
          where: { id },
          data: {
            domain,
            canonicalTerm,
            aliases,
            riskLevel: input.riskLevel ?? existing.riskLevel,
            notes: input.notes === undefined ? existing.notes : input.notes,
            updatedBy: userId ?? null,
          },
        });

        await tx.searchAliasAuditLog.create({
          data: {
            domain,
            action: 'UPDATE_ALIAS_GROUP',
            before: this.toNullableJsonInput(existing),
            after: this.toNullableJsonInput(group),
            operatorId: userId ?? null,
          },
        });

        return group;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async disableAliasGroup(id: string, userId?: string | null) {
    const existing = await this.prisma.searchAliasGroup.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('搜索别名组不存在');
    }

    return this.prisma.$transaction(async (tx: SearchGovernanceTransaction) => {
      const group = await tx.searchAliasGroup.update({
        where: { id },
        data: {
          status: 'DISABLED',
          updatedBy: userId ?? null,
        },
      });

      await tx.searchAliasAuditLog.create({
        data: {
          domain: existing.domain,
          action: 'DISABLE_ALIAS_GROUP',
          before: this.toNullableJsonInput(existing),
          after: this.toNullableJsonInput(group),
          operatorId: userId ?? null,
        },
      });

      return group;
    });
  }

  async getOverview() {
    const [activeAliasGroups, pendingSuggestions, recentNoResultQueries] =
      await Promise.all([
        this.prisma.searchAliasGroup.findMany({
          where: { status: 'ACTIVE' },
          select: { domain: true, id: true },
        }),
        this.prisma.searchAliasSuggestion.findMany({
          where: { status: 'PENDING' },
          select: { domain: true, id: true },
        }),
        this.prisma.searchQueryLog.findMany({
          where: { resultCount: 0 },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
      ]);

    return {
      activeAliasGroupCount: activeAliasGroups.length,
      pendingSuggestionCount: pendingSuggestions.length,
      recentNoResultQueries,
    };
  }

  async getQueryInsights(params: {
    domain?: SearchGovernanceDomain;
    days?: number;
  }) {
    const days = params.days ?? 14;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    return this.prisma.searchQueryLog.findMany({
      where: {
        createdAt: { gte: since },
        ...(params.domain ? { domain: params.domain } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  private normalizeAliasList(aliases: string[]): string[] {
    const normalizedAliases: string[] = [];
    const seen = new Set<string>();

    for (const alias of aliases ?? []) {
      const trimmed = alias.trim();
      const normalized = normalizeSearchText(trimmed);
      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      normalizedAliases.push(trimmed);
    }

    return normalizedAliases;
  }

  private parseSuggestionPayload(
    payload: Prisma.JsonValue,
    options: { requireAliases: boolean },
  ): SearchAliasSuggestionPayload {
    const value = payload as Record<string, unknown> | null;
    if (
      !value ||
      typeof value.canonicalTerm !== 'string' ||
      !Array.isArray(value.aliases) ||
      value.aliases.some((alias) => typeof alias !== 'string')
    ) {
      throw new BadRequestException('搜索建议内容不完整');
    }

    const canonicalTerm = value.canonicalTerm.trim();
    const aliases = this.normalizeAliasList(value.aliases);

    if (
      !normalizeSearchText(canonicalTerm) ||
      (options.requireAliases && aliases.length === 0)
    ) {
      throw new BadRequestException('搜索建议内容不完整');
    }

    return { canonicalTerm, aliases };
  }

  private async assertNoActiveAliasConflict(
    tx: Pick<PrismaService, 'searchAliasGroup'>,
    domain: SearchGovernanceDomain,
    canonicalTerm: string,
    aliases: string[],
    currentGroupId?: string,
  ): Promise<void> {
    const requestedTerms = [canonicalTerm, ...aliases]
      .map((term) => normalizeSearchText(term))
      .filter(Boolean);
    const requestedTermSet = new Set(requestedTerms);

    const activeGroups = await tx.searchAliasGroup.findMany({
      where: { domain, status: 'ACTIVE' },
      orderBy: { canonicalTerm: 'asc' },
    });

    for (const group of activeGroups) {
      if (currentGroupId && group.id === currentGroupId) {
        continue;
      }

      const activeTerms = [group.canonicalTerm, ...(group.aliases ?? [])]
        .map((term) => normalizeSearchText(term))
        .filter(Boolean);

      if (activeTerms.some((term) => requestedTermSet.has(term))) {
        throw new BadRequestException('搜索别名与同域已有活跃别名组冲突');
      }
    }
  }

  private async assertNoCanonicalTermConflict(
    tx: Pick<PrismaService, 'searchAliasGroup'>,
    domain: SearchGovernanceDomain,
    canonicalTerm: string,
    currentGroupId?: string,
  ): Promise<void> {
    const normalizedCanonicalTerm = normalizeSearchText(canonicalTerm);
    const groups = await tx.searchAliasGroup.findMany({
      where: { domain },
      orderBy: { canonicalTerm: 'asc' },
    });

    for (const group of groups) {
      if (currentGroupId && group.id === currentGroupId) {
        continue;
      }

      if (normalizeSearchText(group.canonicalTerm) === normalizedCanonicalTerm) {
        throw new BadRequestException('同域已存在相同标准词的搜索别名组');
      }
    }
  }

  private async lockAliasDomain(
    tx: Pick<SearchGovernanceTransaction, '$queryRaw'>,
    domain: SearchGovernanceDomain,
  ): Promise<void> {
    await tx.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`search-governance:${domain}`}))`,
    );
  }

  private toNullableJsonInput(value: unknown): NullableJsonInput {
    if (value === null || value === undefined) {
      return Prisma.DbNull;
    }

    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private markSuggestionFailed(
    tx: Pick<SearchGovernanceTransaction, 'searchAliasSuggestion'>,
    id: string,
    reviewerId: string,
    errorMessage: string,
  ) {
    return tx.searchAliasSuggestion.update({
      where: { id },
      data: {
        status: 'FAILED',
        reviewerId,
        reviewedAt: new Date(),
        errorMessage,
      },
    });
  }

  private getApprovalErrorMessage(error: unknown): string {
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      if (typeof response === 'string') {
        return response;
      }
      if (
        typeof response === 'object' &&
        response !== null &&
        'message' in response
      ) {
        const message = (response as { message?: unknown }).message;
        return Array.isArray(message) ? message.join('; ') : String(message);
      }
    }

    return error instanceof Error ? error.message : '搜索建议自动应用失败';
  }
}

function buildDeterministicSuggestionsFromLogs(
  logs: SearchQueryLogForSuggestions[],
): CreateSearchAliasSuggestionInput[] {
  const selectionGroups = new Map<string, SearchQueryLogForSuggestions[]>();
  const noResultGroups = new Map<string, SearchQueryLogForSuggestions[]>();

  for (const log of logs) {
    const normalizedQuery = normalizeSearchText(log.normalizedQuery ?? log.rawQuery);
    if (!normalizedQuery) {
      continue;
    }

    if (log.selectedEntityName) {
      const selectedEntityName = log.selectedEntityName.trim();
      if (selectedEntityName) {
        const key = `${log.domain}:${normalizedQuery}:${selectedEntityName}`;
        selectionGroups.set(key, [...(selectionGroups.get(key) ?? []), log]);
      }
    }

    if ((log.resultCount ?? 0) === 0) {
      const key = `${log.domain}:${normalizedQuery}`;
      noResultGroups.set(key, [...(noResultGroups.get(key) ?? []), log]);
    }
  }

  const suggestions: CreateSearchAliasSuggestionInput[] = [];

  for (const groupLogs of selectionGroups.values()) {
    const firstLog = groupLogs[0];
    const selectedEntityName = firstLog.selectedEntityName?.trim();
    const normalizedQuery = normalizeSearchText(firstLog.normalizedQuery ?? firstLog.rawQuery);
    if (!selectedEntityName || normalizeSearchText(selectedEntityName) === normalizedQuery) {
      continue;
    }

    const rawQueries = uniqueNormalizedStrings(
      groupLogs.map((log) => log.rawQuery ?? log.normalizedQuery ?? normalizedQuery),
    );

    suggestions.push({
      domain: firstLog.domain,
      action: 'ADD_ALIAS',
      payload: {
        canonicalTerm: selectedEntityName,
        aliases: rawQueries.length > 0 ? rawQueries : [normalizedQuery],
      },
      evidence: {
        count: groupLogs.length,
        rawQueries,
        selectedEntityName,
      },
      riskLevel: 'LOW',
      agentRationale: '用户搜索后选择了不同名称的实体，建议补充为别名。',
    });
  }

  for (const groupLogs of noResultGroups.values()) {
    if (groupLogs.length < 3) {
      continue;
    }

    const firstLog = groupLogs[0];
    const normalizedQuery = normalizeSearchText(firstLog.normalizedQuery ?? firstLog.rawQuery);
    const rawQueries = uniqueNormalizedStrings(
      groupLogs.map((log) => log.rawQuery ?? log.normalizedQuery ?? normalizedQuery),
    );
    const canonicalTerm = rawQueries[0] ?? normalizedQuery;
    const aliases = rawQueries.filter(
      (query) => normalizeSearchText(query) !== normalizeSearchText(canonicalTerm),
    );

    suggestions.push({
      domain: firstLog.domain,
      action: 'CREATE_GROUP',
      payload: {
        canonicalTerm,
        aliases,
      },
      evidence: {
        count: groupLogs.length,
        rawQueries,
      },
      riskLevel: 'MEDIUM',
      agentRationale: '多次无结果搜索命中同一归一化词，建议创建别名组。',
    });
  }

  return suggestions;
}

function filterAlreadyRepresentedSuggestions(
  suggestions: CreateSearchAliasSuggestionInput[],
  activeAliasGroups: SearchAliasGroupForSuggestions[],
  existingSuggestions: SearchAliasSuggestionForDedup[],
): CreateSearchAliasSuggestionInput[] {
  const existingSuggestionKeys = new Set(
    existingSuggestions
      .map((suggestion) => buildSuggestionDedupKey(suggestion))
      .filter((key): key is string => Boolean(key)),
  );

  return suggestions.filter((suggestion) => {
    const key = buildSuggestionDedupKey(suggestion);
    if (key && existingSuggestionKeys.has(key)) {
      return false;
    }

    return !activeAliasGroups.some((group) => {
      if (group.domain !== suggestion.domain) {
        return false;
      }

      const payload = readSuggestionPayload(suggestion.payload);
      if (!payload) {
        return false;
      }

      const activeTerms = new Set(
        [group.canonicalTerm, ...(group.aliases ?? [])]
          .map((term) => normalizeSearchText(term))
          .filter(Boolean),
      );
      const canonicalTerm = normalizeSearchText(payload.canonicalTerm);

      if (suggestion.action === 'ADD_ALIAS') {
        return (
          normalizeSearchText(group.canonicalTerm) === canonicalTerm &&
          payload.aliases.every((alias) => activeTerms.has(normalizeSearchText(alias)))
        );
      }

      if (suggestion.action === 'CREATE_GROUP') {
        return activeTerms.has(canonicalTerm);
      }

      return false;
    });
  });
}

function buildSuggestionDedupKey(
  suggestion: {
    domain: SearchGovernanceDomain;
    action: SearchAliasSuggestionAction;
    payload: Prisma.InputJsonValue | Prisma.JsonValue;
  },
): string | null {
  const payload = readSuggestionPayload(suggestion.payload);
  if (!payload) {
    return null;
  }

  return [
    suggestion.domain,
    suggestion.action,
    normalizeSearchText(payload.canonicalTerm),
    ...payload.aliases.map((alias) => normalizeSearchText(alias)).sort(),
  ].join(':');
}

function readSuggestionPayload(payload: Prisma.InputJsonValue | Prisma.JsonValue): SearchAliasSuggestionPayload | null {
  const value = payload as Record<string, unknown> | null;
  if (
    !value ||
    typeof value.canonicalTerm !== 'string' ||
    !Array.isArray(value.aliases) ||
    value.aliases.some((alias) => typeof alias !== 'string')
  ) {
    return null;
  }

  return {
    canonicalTerm: value.canonicalTerm,
    aliases: uniqueNormalizedStrings(value.aliases),
  };
}

function uniqueNormalizedStrings(values: string[]): string[] {
  const results: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const trimmed = value.trim();
    const normalized = normalizeSearchText(trimmed);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    results.push(trimmed);
  }

  return results;
}
