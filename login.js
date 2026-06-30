(async function () {
  const feedback = document.getElementById("authFeedback");
  const form = document.getElementById("loginForm");
  const submitBtn = document.getElementById("loginSubmitBtn");
  const registerBtn = document.getElementById("registerBtn");
  const submitLabel = submitBtn ? submitBtn.querySelector(".btn-label") : null;
  const helper = document.querySelector(".login-helper");

  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const fullNameInput = document.getElementById("fullName");
  const orgInput = document.getElementById("organizationName");
  const fullNameField = document.getElementById("fullNameField");
  const orgField = document.getElementById("organizationField");
  const floatingInputs = [emailInput, passwordInput, fullNameInput, orgInput].filter(Boolean);
  const strongPassword = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,64}$/;

  let isRegisterMode = false;

  if (!form || !submitBtn || !registerBtn || !emailInput || !passwordInput || !fullNameInput || !orgInput) {
    return;
  }

  const show = (msg, ok) => {
    if (!feedback) return;
    feedback.textContent = msg;
    feedback.className = "feedback login-feedback " + (ok ? "ok" : "err");
  };

  const setLoading = (on) => {
    submitBtn.classList.toggle("is-loading", on);
    submitBtn.disabled = on;
    registerBtn.disabled = on;
  };

  const applyMode = () => {
    if (submitLabel) submitLabel.textContent = isRegisterMode ? "Criar conta" : "Entrar";
    registerBtn.textContent = isRegisterMode ? "Voltar ao login" : "Criar nova conta";

    if (fullNameField) fullNameField.hidden = !isRegisterMode;
    if (orgField) orgField.hidden = !isRegisterMode;

    if (isRegisterMode && orgInput && !String(orgInput.value || "").trim()) {
      orgInput.value = "Shared Workspace";
    }

    fullNameInput.required = isRegisterMode;
    orgInput.required = isRegisterMode;

    if (helper) {
      helper.textContent = isRegisterMode
        ? "Registo: email + password forte + nome. A organizacao e partilhada por todas as contas."
        : "Login: use o mesmo email e password da conta criada.";
    }
  };

  const syncFieldState = (input) => {
    const wrapper = input && input.closest(".field");
    if (!wrapper) return;
    wrapper.classList.toggle("has-value", String(input.value || "").trim().length > 0);
  };

  floatingInputs.forEach((input) => {
    ["input", "change", "blur"].forEach((eventName) => {
      input.addEventListener(eventName, () => syncFieldState(input));
    });
    syncFieldState(input);
  });

  setTimeout(() => floatingInputs.forEach((input) => syncFieldState(input)), 120);

  try {
    const existing = await window.CRMAuth.ensureAuth({ redirectToLogin: false });
    if (existing && existing.accessToken) {
      location.href = "dashboard.html?v=20260630b";
      return;
    }
  } catch (_error) {
    // Stay on login page.
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = String(emailInput.value || "").trim().toLowerCase();
    const password = String(passwordInput.value || "");

    if (!email || !password) {
      show("Preencha email e palavra-passe.", false);
      return;
    }

    if (!isRegisterMode) {
      setLoading(true);
      try {
        await window.CRMApi.login({ email, password });
        location.href = "dashboard.html?v=20260630b";
      } catch (error) {
        show(error && error.message ? error.message : "Falha no login.", false);
      } finally {
        setLoading(false);
      }
      return;
    }

    const fullName = String(fullNameInput.value || "").trim();
    const organizationName = String(orgInput.value || "").trim();

    if (!fullName || !organizationName) {
      show("Para registar, preencha nome e organizacao.", false);
      return;
    }

    if (!strongPassword.test(password)) {
      show("Password fraca. Use 8+ caracteres com maiuscula, minuscula e numero.", false);
      return;
    }

    setLoading(true);
    try {
      await window.CRMApi.register({
        email,
        password,
        fullName,
        organizationName
      });

      await window.CRMApi.login({ email, password });
      location.href = "dashboard.html?v=20260630b";
    } catch (error) {
      show(error && error.message ? error.message : "Falha no registo.", false);
    } finally {
      setLoading(false);
    }
  });

  registerBtn.addEventListener("click", () => {
    isRegisterMode = !isRegisterMode;
    show("", true);
    applyMode();
  });

  applyMode();
  setLoading(false);
})();
