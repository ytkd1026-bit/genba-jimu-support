import test from "node:test";
import assert from "node:assert/strict";
import {
  appSetupStorageKey,
  isSetupCompleted,
  migrateLegacySetupState,
  setSetupCompleted,
} from "../src/app/utils/appSetup.ts";

function installStorage(initial = []) {
  const values = new Map(initial);
  globalThis.window = {};
  globalThis.localStorage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
  };
  return values;
}

test("初期設定キーはuserとorganizationで分離される", () => {
  assert.equal(appSetupStorageKey("user-a", "org-1"), "genba_app_setup_v1:user-a:org-1");
  assert.notEqual(appSetupStorageKey("user-a", "org-1"), appSetupStorageKey("user-b", "org-1"));
  assert.notEqual(appSetupStorageKey("user-a", "org-1"), appSetupStorageKey("user-a", "org-2"));
});

test("user Aの完了状態をuser Bや別organizationが引き継がない", () => {
  installStorage();
  assert.equal(setSetupCompleted("user-a", "org-1", true), true);
  assert.equal(isSetupCompleted("user-a", "org-1"), true);
  assert.equal(isSetupCompleted("user-b", "org-1"), false);
  assert.equal(isSetupCompleted("user-a", "org-2"), false);
});

test("保存値のscopeがキーと一致しなければ完了扱いにしない", () => {
  const key = appSetupStorageKey("user-a", "org-1");
  installStorage([[key, JSON.stringify({
    setupCompleted: true,
    userId: "user-b",
    organizationId: "org-1",
  })]]);
  assert.equal(isSetupCompleted("user-a", "org-1"), false);
});

test("旧固定キーは新scopeへ保存成功後にだけ削除する", () => {
  const values = installStorage([["genba_app_setup_v1", JSON.stringify({ setupCompleted: true })]]);
  assert.equal(migrateLegacySetupState("user-a", "org-1"), true);
  assert.equal(isSetupCompleted("user-a", "org-1"), true);
  assert.equal(values.has("genba_app_setup_v1"), false);
  assert.equal(values.has(appSetupStorageKey("user-a", "org-1")), true);
});
