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
    el.hidden = !yes;
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

  function statusLabel(s) {
    if (s === "waiting") return "Espera";
    if (s === "calling") return "Llamando";
    if (s === "in_service") return "Atención";
    if (s === "finished") return "Fin";
    if (s === "absent") return "Ausente";
    if (s === "cancelled") return "Cancelado";
    return s || "—";
  }

  function renderState(state) {
    var sp = state.servicePoint;
    $("desk-name").textContent = sp ? " · " + sp.name : " · Sin puesto";
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
      $("my-status").textContent = statusLabel(mine.status);
      $("active-code").textContent = mine.displayCode || mine.code || "—";
      var meta = [];
      if (mine.area) meta.push(mine.area);
      if (mine.procedure) meta.push(mine.procedure);
      $("active-meta").textContent = meta.join(" · ");
      show($("panel-idle"), false);
      show($("panel-active"), true);
      $("call-btn").disabled = true;
    } else {
      $("my-code").textContent = "—";
      $("my-status").textContent = "Libre";
      show($("panel-idle"), true);
      show($("panel-active"), false);
      $("call-btn").disabled = !(sp && sp.active);
      show($("transfer-counter-btn"), false);
      show($("transfer-cashier-btn"), false);
      show($("transfer-origin-btn"), false);
    }

    var list = $("recent-list");
    list.innerHTML = "";
    var recent = state.recent || [];
    if (!recent.length) {
      var empty = document.createElement("li");
      empty.textContent = "Sin turnos hoy";
      list.appendChild(empty);
    } else {
      for (var i = 0; i < recent.length; i++) {
        var t = recent[i];
        var li = document.createElement("li");
        var left = document.createElement("span");
        left.innerHTML = "<b>" + (t.code || "—") + "</b> · " + (t.procedure || "—");
        var badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = statusLabel(t.status);
        li.appendChild(left);
        li.appendChild(badge);
        list.appendChild(li);
      }
    }
  }

  function showLogin() {
    show($("view-login"), true);
    show($("view-desk"), false);
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function showDesk() {
    show($("view-login"), false);
    show($("view-desk"), true);
    refresh();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refresh, 4000);
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

  $("logout-btn").onclick = function () {
    setToken("");
    showLogin();
  };

  $("refresh-btn").onclick = function () {
    refresh();
  };

  $("call-btn").onclick = function () {
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
  };

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

  $("recall-btn").onclick = function () {
    updateStatus("calling", "Repetir llamado");
  };
  $("finish-btn").onclick = function () {
    updateStatus("finished", "Finalizar");
  };
  $("absent-btn").onclick = function () {
    updateStatus("absent", "Ausente");
  };
  $("cancel-btn").onclick = function () {
    if (!window.confirm("¿Cancelar este turno?")) return;
    updateStatus("cancelled", "Cancelar");
  };

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

  $("transfer-counter-btn").onclick = function () {
    doTransfer("counter", "Derivar a ventanilla");
  };
  $("transfer-cashier-btn").onclick = function () {
    doTransfer("cashier", "Derivar a caja");
  };
  $("transfer-origin-btn").onclick = function () {
    var label = $("transfer-origin-btn").textContent || "Devolver";
    doTransfer("origin", label);
  };

  // Si es celular, mandar a la app moderna
  var ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) {
    window.location.replace("/auth");
    return;
  }

  if (getToken()) showDesk();
  else showLogin();
})();
