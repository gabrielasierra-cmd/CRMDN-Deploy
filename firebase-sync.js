(function () {
  const state = {
    enabled: false,
    db: null,
    timer: null,
    initPromise: null,
    pendingWrites: []
  };

  function hasConfig() {
    const cfg = window.FIREBASE_CONFIG || {};
    return ["apiKey", "authDomain", "projectId", "appId"].every((k) => String(cfg[k] || "").trim());
  }

  async function init() {
    if (state.initPromise) return state.initPromise;

    state.initPromise = (async () => {
      if (!window.firebase || !hasConfig()) return false;

      try {
        if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
        state.db = firebase.firestore();
        state.enabled = !!state.db;
        if (state.enabled && state.pendingWrites.length) {
          const queue = [...state.pendingWrites];
          state.pendingWrites = [];
          await Promise.all(queue.map((item) => pushNow(item.key, item.value)));
        }
        return state.enabled;
      } catch (err) {
        console.warn("Firebase init falhou:", err);
        state.enabled = false;
        return false;
      }
    })();

    return state.initPromise;
  }

  function colRef() {
    const col = window.FIREBASE_CRM_COLLECTION || "crm_data";
    return state.db.collection(col);
  }

  async function pull(keys) {
    if (!state.enabled || !Array.isArray(keys) || !keys.length) return false;
    try {
      let changed = false;
      const snaps = await Promise.all(keys.map((k) => colRef().doc(k).get()));
      snaps.forEach((snap, idx) => {
        if (!snap.exists) return;
        const data = snap.data() || {};
        if (!Object.prototype.hasOwnProperty.call(data, "value")) return;
        const next = JSON.stringify(data.value);
        const prev = localStorage.getItem(keys[idx]);
        if (prev === next) return;
        localStorage.setItem(keys[idx], next);
        changed = true;
      });
      if (changed) window.dispatchEvent(new CustomEvent("crm:remote-sync", { detail: { keys } }));
      return changed;
    } catch (err) {
      console.warn("Firebase pull falhou:", err);
      return false;
    }
  }

  async function push(key, value) {
    if (!key) return false;
    if (!state.enabled) {
      state.pendingWrites.push({ key, value });
      return true;
    }
    return pushNow(key, value);
  }

  async function pushNow(key, value) {
    try {
      await colRef().doc(key).set({
        value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return true;
    } catch (err) {
      console.warn("Firebase push falhou:", err);
      return false;
    }
  }

  async function hydrateMissingFromLocal(keys) {
    if (!state.enabled || !Array.isArray(keys) || !keys.length) return false;
    try {
      const snaps = await Promise.all(keys.map((k) => colRef().doc(k).get()));
      const writes = [];
      snaps.forEach((snap, idx) => {
        if (snap.exists) return;
        const key = keys[idx];
        const raw = localStorage.getItem(key);
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw);
          writes.push(pushNow(key, parsed));
        } catch (_) {
          // Ignora payload inválido no localStorage.
        }
      });
      if (!writes.length) return false;
      await Promise.all(writes);
      return true;
    } catch (err) {
      console.warn("Firebase hydrate falhou:", err);
      return false;
    }
  }

  async function mirrorLocal(keys) {
    if (!Array.isArray(keys) || !keys.length) return false;
    const writes = [];
    keys.forEach((key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        writes.push(push(key, parsed));
      } catch (_) {
        // ignora payload invalido
      }
    });
    if (!writes.length) return false;
    await Promise.all(writes);
    return true;
  }

  function start(keys, ms) {
    if (!state.enabled) return;
    if (state.timer) clearInterval(state.timer);
    const intervalMs = Number(ms) > 0 ? Number(ms) : 30000;
    state.timer = setInterval(() => { pull(keys); }, intervalMs);
  }

  function stop() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  }

  window.CRMDB = {
    init,
    pull,
    push,
    hydrateMissingFromLocal,
    mirrorLocal,
    start,
    stop,
    isEnabled: () => state.enabled
  };
})();
