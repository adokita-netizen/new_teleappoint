import { createCaller } from "./server/_core/trpc";
import * as db from "./server/db";

async function testAPI() {
  console.log("=== テレアポ管理アプリ APIテスト ===\n");

  // Mock context for testing
  const mockContext = {
    user: {
      id: 1,
      openId: "test-open-id",
      name: "テストユーザー",
      email: "test@example.com",
      role: "admin" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      loginMethod: "test",
    },
    req: {} as any,
    res: {} as any,
  };

  const caller = createCaller(mockContext);

  try {
    // Test 1: Create a list
    console.log("Test 1: リスト作成");
    const listResult = await caller.lists.create({
      name: "テストリスト",
      description: "APIテスト用のリスト",
    });
    console.log("✓ リスト作成成功:", listResult);

    // Test 2: Import leads
    console.log("\nTest 2: リードインポート");
    const importResult = await caller.leads.import({
      leads: [
        {
          name: "山田太郎",
          company: "株式会社サンプル",
          phone: "03-1234-5678",
          email: "yamada@sample.co.jp",
          prefecture: "東京都",
          industry: "IT",
          memo: "テストデータ1",
        },
        {
          name: "佐藤花子",
          company: "テスト商事",
          phone: "06-9876-5432",
          email: "sato@test.co.jp",
          prefecture: "大阪府",
          industry: "製造業",
          memo: "テストデータ2",
        },
      ],
    });
    console.log("✓ リードインポート成功:", importResult);

    // Test 3: Get all leads
    console.log("\nTest 3: リード一覧取得");
    const leads = await caller.leads.list({});
    console.log("✓ リード一覧取得成功:", leads.length, "件");

    // Test 4: Assign lead to agent
    if (leads.length > 0) {
      console.log("\nTest 4: リード配布");
      const assignResult = await caller.leads.assign({
        leadIds: [leads[0].id],
        agentId: 1,
      });
      console.log("✓ リード配布成功:", assignResult);
    }

    // Test 5: Get next lead
    console.log("\nTest 5: 次のリード取得");
    const nextLead = await caller.leads.getNext();
    console.log("✓ 次のリード取得:", nextLead ? nextLead.name : "なし");

    // Test 6: Create call log
    if (nextLead) {
      console.log("\nTest 6: コールログ作成");
      const callLogResult = await caller.callLogs.create({
        leadId: nextLead.id,
        result: "connected",
        memo: "テスト通話",
      });
      console.log("✓ コールログ作成成功:", callLogResult);
    }

    // Test 7: Get KPI
    console.log("\nTest 7: KPI取得");
    const kpi = await caller.dashboard.getKPI({
      startDate: new Date(new Date().setDate(new Date().getDate() - 7)),
      endDate: new Date(),
    });
    console.log("✓ KPI取得成功:", kpi);

    console.log("\n=== すべてのテストが成功しました ===");
  } catch (error) {
    console.error("✗ テスト失敗:", error);
    process.exit(1);
  }
}

testAPI();

