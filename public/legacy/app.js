/* SIGAT panel Win7 — JS simple (sin React). Compatible Chrome 109. */
(function () {
  var TOKEN_KEY = "sigat_legacy_token";
  var pollTimer = null;

  function $(id) {
    return document.getElementById(id);
  }

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function setToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  }

  function show(el, yes) {
    if (!el) return;
    if (yes) {
      el.removeAttribute("hidden");
      el.style.display = "";
    } else {
      el.setAttribute("hidden", "hidden");
      el.style.display = "none";
    }
  }

  function showBootError(msg) {
    var el = $("boot-error");
    if (!el) return;
    el.style.display = "block";
    el.textContent = msg || "Error al cargar el panel Win7";
  }

  function setMsg(text, isError) {
    var el = $("desk-msg");
    if (!text) {
      show(el, false);
      return;
    }
    el.textContent = text;
    el.style.background = isError ? "#fde8e6" : "#e8f2ed";
    el.style.borderColor = isError ? "#e2a39c" : "#b8cfc4";
    show(el, true);
  }

  function api(path, options) {
    options = options || {};
    var headers = options.headers || {};
    headers["Content-Type"] = "application/json";
    var token = getToken();
    if (token) headers["Authorization"] = "Bearer " + token;
    return fetch(path, {
      method: options.method || "GET",
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = new Error((data && data.error) || "Error " + res.status);
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function deskRoleText(sp) {
    if (!sp) return "Sin puesto asignado";
    var kind = sp.kind || "standard";
    var name = (sp.name || "").toLowerCase();
    if (kind === "ruat") {
      return name.indexOf("jefe") >= 0
        ? "Jefe de Recaudaciones — puede derivar a ventanilla o caja"
        : "Operador RUAT — puede derivar a ventanilla o caja";
    }
    if (kind === "counter") return "Ventanilla — puede derivar a caja o devolver al origen";
    if (kind === "cashier") return "Caja — puede devolver al origen (RUAT o Jefe)";
    return "Puesto general";
  }

  /** Misma lógica de StatusPill del panel moderno */
  function statusPill(s, transferTo) {
    if (s === "waiting" && transferTo === "counter") return { label: "A ventanilla", cls: "pill-warn" };
    if (s === "waiting" && transferTo === "origin") return { label: "Vuelve al origen", cls: "pill-primary" };
    if (s === "waiting" && transferTo === "ruat") return { label: "A RUAT / Jefe", cls: "pill-primary" };
    if (s === "waiting" && transferTo === "cashier") return { label: "A caja", cls: "pill-warn" };
    if (s === "waiting") return { label: "En espera", cls: "pill-muted" };
    if (s === "calling") return { label: "Llamando", cls: "pill-warn" };
    if (s === "in_service") return { label: "En atención", cls: "pill-primary" };
    if (s === "finished") return { label: "Finalizado", cls: "pill-ok" };
    if (s === "absent") return { label: "Ausente", cls: "pill-danger" };
    if (s === "cancelled") return { label: "Cancelado", cls: "pill-danger" };
    return { label: s || "—", cls: "pill-muted" };
  }

  function renderTags(mine) {
    var box = $("active-tags");
    box.innerHTML = "";
    if (!mine) return;
    if (mine.area) {
      var a = document.createElement("span");
      a.className = "tag";
      a.textContent = mine.area;
      box.appendChild(a);
    }
    if (mine.procedure) {
      var p = document.createElement("span");
      p.className = "tag";
      p.textContent = mine.procedure;
      box.appendChild(p);
    }
    if (mine.ci) {
      var c = document.createElement("span");
      c.className = "tag tag-ci";
      c.textContent = "CI: " + mine.ci;
      box.appendChild(c);
    }
  }

  function renderNav(state) {
    var user = state.user || {};
    var roles = user.roles || [];
    var isAdmin = roles.indexOf("admin") >= 0;
    var isHost = roles.indexOf("host") >= 0;
    var isOperator = roles.indexOf("operator") >= 0 || roles.length === 0 || isAdmin;

    $("user-email").textContent = user.email || "";
    $("app-version").textContent = state.version || "";

    var items = [];
    if (isOperator) {
      items.push({ href: "/legacy/index.html", label: "Mi puesto", active: true });
    }
    if (isHost || isAdmin) {
      items.push({ href: "/host", label: "Sacar turnos", active: false });
    }
    if (isAdmin) {
      items.push({ href: "/admin", label: "Dashboard", active: false });
      items.push({ href: "/admin/users", label: "Usuarios", active: false });
      items.push({ href: "/admin/service-points", label: "Puestos", active: false });
      items.push({ href: "/admin/procedures", label: "Áreas y trámites", active: false });
      items.push({ href: "/admin/settings", label: "Configuración", active: false });
    }

    var nav = $("sidebar-nav");
    nav.innerHTML = "";
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var a = document.createElement("a");
      a.className = "nav-link" + (item.active ? " active" : "");
      a.href = item.href;
      a.textContent = item.label;
      nav.appendChild(a);
    }
  }

  function setMenuOpen(open) {
    var desk = $("view-desk");
    if (!desk) return;
    if (open) desk.className = "page page-desk menu-open";
    else desk.className = "page page-desk";
    // El backdrop se muestra vía CSS (.menu-open .menu-backdrop)
    var bd = $("menu-backdrop");
    if (bd) {
      if (open) bd.removeAttribute("hidden");
      else bd.setAttribute("hidden", "hidden");
    }
  }

  function renderState(state) {
    renderNav(state);
    var sp = state.servicePoint;
    $("desk-title").textContent = sp ? sp.name : "Sin puesto asignado";
    $("desk-role").textContent = deskRoleText(sp);
    show($("desk-inactive"), !!(sp && sp.active === false));
    $("queue-count").textContent = String(state.queueCount || 0);

    var actions = state.actions || {};
    show($("transfer-counter-btn"), !!actions.canTransferToCounter);
    show($("transfer-cashier-btn"), !!actions.canTransferToCashier);
    show($("transfer-origin-btn"), !!actions.canReturnToOrigin);
    if (actions.returnLabel) {
      $("transfer-origin-btn").textContent = actions.returnLabel;
    }

    var mine = state.myCalling;
    if (mine) {
      $("my-code").textContent = mine.displayCode || mine.code || "—";
      $("my-status").textContent = mine.status === "calling" ? "Llamando" : "Atención";
      $("active-code").textContent = mine.displayCode || mine.code || "—";
      renderTags(mine);
      show($("panel-idle"), false);
      show($("panel-active"), true);
      $("call-btn").disabled = true;
    } else {
      $("my-code").textContent = "—";
      $("my-status").textContent = "Libre";
      $("active-tags").innerHTML = "";
      show($("panel-idle"), true);
      show($("panel-active"), false);
      $("call-btn").disabled = !(sp && sp.active);
      show($("transfer-counter-btn"), false);
      show($("transfer-cashier-btn"), false);
      show($("transfer-origin-btn"), false);
    }

    var tbody = $("day-tbody");
    var emptyEl = $("day-empty");
    var wrap = $("day-table-wrap");
    tbody.innerHTML = "";
    var dayTickets = state.dayTickets || state.recent || [];
    if (!dayTickets.length) {
      show(emptyEl, true);
      show(wrap, false);
    } else {
      show(emptyEl, false);
      show(wrap, true);
      for (var i = 0; i < dayTickets.length; i++) {
        var t = dayTickets[i];
        var pill = statusPill(t.status, t.transfer_to);
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td class=\"col-code\">" + escapeHtml(t.code || "—") + "</td>" +
          "<td>" + escapeHtml(t.procedure || "—") + "</td>" +
          "<td><span class=\"pill " + pill.cls + "\">" + escapeHtml(pill.label) + "</span></td>" +
          "<td class=\"col-muted\">" + escapeHtml(t.service_point || "—") + "</td>";
        tbody.appendChild(tr);
      }
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showLogin() {
    show($("view-login"), true);
    show($("view-desk"), false);
    setMenuOpen(false);
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function showDesk() {
    show($("view-login"), false);
    show($("view-desk"), true);
    setMenuOpen(false);
    refresh();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refresh, 20_000);
  }

  function refresh() {
    if (!getToken()) return;
    api("/api/legacy/state")
      .then(function (state) {
        renderState(state);
        if (!state.servicePoint) {
          setMsg("Tu usuario no tiene un puesto asignado. Pedile al admin que te asigne uno.", true);
        }
      })
      .catch(function (err) {
        if (err.status === 401) {
          setToken("");
          showLogin();
          $("login-error").textContent = "Sesión vencida. Ingresá de nuevo.";
          show($("login-error"), true);
          return;
        }
        setMsg(err.message || "No se pudo actualizar", true);
      });
  }

  function currentTicketId() {
    return $("panel-active").getAttribute("data-ticket-id") || "";
  }

  var _origRender = renderState;
  renderState = function (state) {
    _origRender(state);
    if (state.myCalling) {
      $("panel-active").setAttribute("data-ticket-id", state.myCalling.id);
    } else {
      $("panel-active").removeAttribute("data-ticket-id");
    }
  };

  function bindClick(id, fn) {
    var el = $(id);
    if (el) el.onclick = fn;
  }

  function doLogout() {
    setToken("");
    setMenuOpen(false);
    showLogin();
  }

  bindClick("logout-btn", doLogout);
  bindClick("logout-btn-top", doLogout);
  bindClick("menu-open", function () { setMenuOpen(true); });
  bindClick("menu-close", function () { setMenuOpen(false); });
  bindClick("menu-backdrop", function () { setMenuOpen(false); });
  bindClick("refresh-btn", function () { refresh(); });

  $("login-form").onsubmit = function (e) {
    e.preventDefault();
    var btn = $("login-btn");
    var err = $("login-error");
    show(err, false);
    btn.disabled = true;
    btn.textContent = "Ingresando...";
    api("/api/legacy/login", {
      method: "POST",
      body: {
        email: $("email").value,
        password: $("password").value,
      },
    })
      .then(function (data) {
        setToken(data.access_token);
        showDesk();
      })
      .catch(function (ex) {
        err.textContent = ex.message || "No se pudo ingresar";
        show(err, true);
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = "Ingresar";
      });
  };

  bindClick("call-btn", function () {
    var btn = $("call-btn");
    btn.disabled = true;
    setMsg("Llamando...", false);
    api("/api/legacy/call-next", { method: "POST", body: {} })
      .then(function (data) {
        if (!data.ticket) {
          setMsg(data.message || "No hay turnos en espera", false);
        } else {
          setMsg("Llamando " + (data.ticket.displayCode || data.ticket.code), false);
        }
        return api("/api/legacy/state");
      })
      .then(function (state) {
        renderState(state);
      })
      .catch(function (ex) {
        setMsg(ex.message || "Error al llamar", true);
      })
      .then(function () {
        btn.disabled = false;
      });
  });

  function updateStatus(status, label) {
    var id = currentTicketId();
    if (!id) {
      setMsg("No hay turno activo", true);
      return;
    }
    setMsg(label + "...", false);
    api("/api/legacy/ticket-status", {
      method: "POST",
      body: { ticketId: id, status: status },
    })
      .then(function () {
        return api("/api/legacy/state");
      })
      .then(function (state) {
        renderState(state);
        setMsg(label + " listo", false);
      })
      .catch(function (ex) {
        setMsg(ex.message || "Error", true);
      });
  }

  bindClick("recall-btn", function () {
    updateStatus("calling", "Repetir llamado");
  });
  bindClick("finish-btn", function () {
    updateStatus("finished", "Finalizar");
  });
  bindClick("absent-btn", function () {
    updateStatus("absent", "Ausente");
  });
  bindClick("cancel-btn", function () {
    if (!window.confirm("¿Cancelar este turno?")) return;
    updateStatus("cancelled", "Cancelar");
  });

  function doTransfer(action, label) {
    var id = currentTicketId();
    if (!id) {
      setMsg("No hay turno activo", true);
      return;
    }
    setMsg(label + "...", false);
    api("/api/legacy/transfer", {
      method: "POST",
      body: { ticketId: id, action: action },
    })
      .then(function () {
        return api("/api/legacy/state");
      })
      .then(function (state) {
        renderState(state);
        setMsg(label + " listo", false);
      })
      .catch(function (ex) {
        setMsg(ex.message || "Error al derivar", true);
      });
  }

  bindClick("transfer-counter-btn", function () {
    doTransfer("counter", "Derivar a ventanilla");
  });
  bindClick("transfer-cashier-btn", function () {
    doTransfer("cashier", "Derivar a caja");
  });
  bindClick("transfer-origin-btn", function () {
    var label = $("transfer-origin-btn").textContent || "Devolver";
    doTransfer("origin", label);
  });

  // Si es celular, mandar a la app moderna
  try {
    var ua = navigator.userAgent || "";
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) {
      window.location.replace("/auth");
      return;
    }

    if (getToken()) showDesk();
    else showLogin();
  } catch (bootErr) {
    showBootError(bootErr && bootErr.message ? bootErr.message : String(bootErr));
  }
})();
