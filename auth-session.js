window.CRMAuth = (() => {
  function getSession() {
    return window.CRMApi ? window.CRMApi.getAuth() : null;
  }

  function setSession(session) {
    if (!window.CRMApi) return;
    window.CRMApi.setAuth(session);
  }

  function clearSession() {
    if (!window.CRMApi) return;
    window.CRMApi.clearAuth();
  }

  function applySessionToUi(session) {
    const userEmail = document.getElementById("userEmail");
    if (userEmail) userEmail.textContent = session && session.user && session.user.email ? session.user.email : "-";

    const sessionInfo = document.getElementById("sessionInfo");
    if (sessionInfo) {
      const role = session && session.role ? String(session.role).toUpperCase() : "-";
      sessionInfo.textContent = session && session.user ? `${session.user.email || ""} | ${role}` : "";
    }
  }

  async function ensureAuth(options) {
    const shouldRedirect = !options || options.redirectToLogin !== false;

    if (!window.CRMApi) {
      if (shouldRedirect) location.href = "index.html";
      return null;
    }

    let session = getSession();
    if (!session || !session.accessToken) {
      session = await window.CRMApi.refreshSession();
    }

    if (!session || !session.accessToken) {
      clearSession();
      if (shouldRedirect) location.href = "index.html";
      return null;
    }

    applySessionToUi(session);
    return session;
  }

  function requireAuth() {
    const session = getSession();
    if (!session || !session.accessToken) {
      location.href = "index.html";
      return null;
    }
    applySessionToUi(session);
    return session;
  }

  function bindLogout(buttonId = "logoutBtn") {
    const button = document.getElementById(buttonId);
    if (!button) return;

    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        if (window.CRMApi) await window.CRMApi.logout();
      } catch (_error) {
        // Ignore network errors and clear local auth state anyway.
      } finally {
        clearSession();
        location.href = "index.html";
      }
    });
  }

  return {
    getSession,
    setSession,
    clearSession,
    requireAuth,
    ensureAuth,
    bindLogout
  };
})();
