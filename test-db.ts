import * as db from "./server/db";

async function testDatabase() {
  console.log("=== テレアポ管理アプリ データベーステスト ===\n");

  try {
    // Test 1: Create a list
    console.log("Test 1: リスト作成");
    const listResult = await db.createList({
      name: "テストリスト",
      description: "データベーステスト用のリスト",
      createdBy: 1,
      totalCount: 0,
    });
    console.log("✓ リスト作成成功");

    // Test 2: Create leads
    console.log("\nTest 2: リード作成");
    const lead1 = await db.createLead({
      name: "山田太郎",
      company: "株式会社サンプル",
      phone: "03-1234-5678",
      email: "yamada@sample.co.jp",
      prefecture: "東京都",
      industry: "IT",
      memo: "テストデータ1",
      status: "unreached",
      ownerId: 1,
    });
    console.log("✓ リード1作成成功");

    const lead2 = await db.createLead({
      name: "佐藤花子",
      company: "テスト商事",
      phone: "06-9876-5432",
      email: "sato@test.co.jp",
      prefecture: "大阪府",
      industry: "製造業",
      memo: "テストデータ2",
      status: "unreached",
      ownerId: 1,
    });
    console.log("✓ リード2作成成功");

    // Test 3: Get leads by owner
    console.log("\nTest 3: オーナー別リード取得");
    const ownerLeads = await db.getLeadsByOwnerId(1);
    console.log("✓ リード取得成功:", ownerLeads.length, "件");

    // Test 4: Get next lead
    console.log("\nTest 4: 次のリード取得");
    const nextLead = await db.getNextLead(1);
    console.log("✓ 次のリード:", nextLead ? nextLead.name : "なし");

    // Test 5: Create call log
    if (nextLead) {
      console.log("\nTest 5: コールログ作成");
      await db.createCallLog({
        leadId: nextLead.id,
        agentId: 1,
        result: "connected",
        memo: "テスト通話",
      });
      console.log("✓ コールログ作成成功");

      // Update lead status
      await db.updateLead(nextLead.id, { status: "connected" });
      console.log("✓ リードステータス更新成功");
    }

    // Test 6: Get KPI stats
    console.log("\nTest 6: KPI統計取得");
    const kpi = await db.getKPIStats({
      startDate: new Date(new Date().setDate(new Date().getDate() - 7)),
      endDate: new Date(),
    });
    console.log("✓ KPI取得成功:", kpi);

    // Test 7: Create appointment
    if (nextLead) {
      console.log("\nTest 7: アポイント作成");
      await db.createAppointment({
        leadId: nextLead.id,
        ownerUserId: 1,
        status: "scheduled",
        startAt: new Date(Date.now() + 86400000), // Tomorrow
        endAt: new Date(Date.now() + 86400000 + 3600000), // Tomorrow + 1 hour
        title: "テストアポイント",
      });
      console.log("✓ アポイント作成成功");
    }

    // Test 8: Get all lists
    console.log("\nTest 8: リスト一覧取得");
    const allLists = await db.getAllLists();
    console.log("✓ リスト一覧取得成功:", allLists.length, "件");

    console.log("\n=== すべてのテストが成功しました ===");
  } catch (error) {
    console.error("✗ テスト失敗:", error);
    process.exit(1);
  }

  process.exit(0);
}

testDatabase();

