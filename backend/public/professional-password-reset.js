(() => {
  'use strict';
  const requestForm = document.getElementById('requestForm');
  const confirmForm = document.getElementById('confirmForm');
  const statusBox = document.getElementById('statusBox');
  const email = document.getElementById('email');
  const code = document.getElementById('code');
  const password = document.getElementById('password');
  const confirmPassword = document.getElementById('confirmPassword');
  const restartBtn = document.getElementById('restartBtn');

  function showStatus(message, error = false) {
    statusBox.textContent = message || '';
    statusBox.classList.toggle('hidden', !message);
    statusBox.classList.toggle('error', error);
  }
  function busy(form, value) {
    form.querySelectorAll('button,input').forEach((control) => { control.disabled = value; });
  }
  async function api(path, body) {
    const response = await fetch(`/api/professional-auth${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || `Operazione non riuscita (${response.status})`);
    return payload;
  }

  requestForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    busy(requestForm, true);
    showStatus('');
    try {
      await api('/password-reset/request', { email: email.value.trim() });
      requestForm.classList.add('hidden');
      confirmForm.classList.remove('hidden');
      showStatus('Se l’indirizzo è registrato, il codice è stato inviato.');
      code.focus();
    } catch (error) {
      showStatus(error.message || 'Invio non riuscito.', true);
    } finally {
      busy(requestForm, false);
    }
  });

  confirmForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (password.value !== confirmPassword.value) {
      showStatus('Le password non coincidono.', true);
      return;
    }
    busy(confirmForm, true);
    showStatus('');
    try {
      await api('/password-reset/confirm', {
        email: email.value.trim(),
        code: code.value.trim(),
        password: password.value,
        confirmPassword: confirmPassword.value,
      });
      showStatus('Password aggiornata. Ora puoi accedere con la nuova password.');
      setTimeout(() => { location.href = '/professionisti'; }, 1200);
    } catch (error) {
      showStatus(error.message || 'Codice non valido o scaduto.', true);
    } finally {
      busy(confirmForm, false);
    }
  });

  restartBtn.addEventListener('click', () => {
    confirmForm.classList.add('hidden');
    requestForm.classList.remove('hidden');
    code.value = '';
    password.value = '';
    confirmPassword.value = '';
    showStatus('');
    email.focus();
  });
})();
