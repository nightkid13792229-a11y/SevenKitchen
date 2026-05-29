import { PrismaClient, SearchGovernanceDomain } from '@prisma/client';

const prisma = new PrismaClient();

const aliasGroups = [
  {
    domain: SearchGovernanceDomain.INGREDIENT,
    canonicalTerm: '西兰花',
    aliases: ['西蓝花', '青花菜', '绿花椰菜', 'broccoli'],
  },
  {
    domain: SearchGovernanceDomain.INGREDIENT,
    canonicalTerm: '鸡胸',
    aliases: ['鸡胸肉', 'chicken breast'],
  },
  {
    domain: SearchGovernanceDomain.INGREDIENT,
    canonicalTerm: '三文鱼',
    aliases: ['鲑鱼', 'salmon'],
  },
  {
    domain: SearchGovernanceDomain.ORDER,
    canonicalTerm: '待支付',
    aliases: ['未付款', '未支付', '待付款'],
  },
  {
    domain: SearchGovernanceDomain.ORDER,
    canonicalTerm: '已支付',
    aliases: ['已付款', '付款成功'],
  },
];

async function main() {
  console.log('Seeding search governance aliases...');

  for (const group of aliasGroups) {
    await prisma.searchAliasGroup.upsert({
      where: {
        domain_canonicalTerm: {
          domain: group.domain,
          canonicalTerm: group.canonicalTerm,
        },
      },
      create: {
        ...group,
        createdBy: 'seed:search-governance-aliases',
        updatedBy: 'seed:search-governance-aliases',
      },
      update: {
        aliases: group.aliases,
        status: 'ACTIVE',
        riskLevel: 'LOW',
        updatedBy: 'seed:search-governance-aliases',
      },
    });

    console.log(`- ${group.domain}: ${group.canonicalTerm}`);
  }

  console.log(`Seeded ${aliasGroups.length} search governance alias groups.`);
}

main()
  .catch((error) => {
    console.error('Failed to seed search governance aliases:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
