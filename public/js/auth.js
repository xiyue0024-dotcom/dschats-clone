'use strict';

const $ = (id) => document.getElementById(id);
const state = { mode: 'login', busy: false };

function setMode(mode) {
  state.mode = mode;
  const isLogin = mode === 'login';
  $('tab-login').classList.toggle('active', isLogin);
  $('tab-register').classList.toggle('active', !isLogin);
  $('eyebrow').textContent = isLogin ? '欢迎回来' : '创建工作区';
  $('title').textContent = isLogin ? '登录你的工作区' : '从第一段真实关系开始';
  $('subtitle').textContent = isLogin ? '登录后，继续处理你的聊天与事项。' : '注册后自动创建默认工作区，并载入演示数据。';
  $('confirm-field').classList.toggle('hidden', isLogin);
  $('password').setAttribute('autocomplete', isLogin ? 'current-password' : 'new-password');
  $('submit').textContent = isLogin ? '登录' : '创建账号';
  $('switch').innerHTML = isLogin
    ? '还没有账号？<a href="#register" id="switch-link">立即注册</a>'
    : '已经有账号？<a href="#login" id="switch-link">去登录</a>';
  bindSwitch();
  hideError();
}

function bindSwitch() {
  const link = $('switch-link');
  if (!link) return;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    setMode(state.mode === 'login' ? 'register' : 'login');
    history.replaceState(null, '', state.mode === 'login' ? '#login' : '#register');
  });
}

function showError(msg) {
  const el = $('error');
  el.textContent = msg;
  el.classList.add('show');
}

function hideError() {
  $('error').classList.remove('show');
}

async function submit(e) {
  e.preventDefault();
  if (state.busy) return;
  hideError();

  const email = $('email').value.trim();
  const password = $('password').value;
  if (!email) return showError('请填写邮箱');
  if (password.length < 8) return showError('密码至少 8 位');
  if (state.mode === 'register' && password !== $('confirm').value) {
    return showError('两次输入的密码不一致');
  }

  state.busy = true;
  const btn = $('submit');
  const label = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="loading-dots"><span></span><span></span><span></span></span>';

  try {
    const resp = await fetch(state.mode === 'login' ? '/api/auth/login' : '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data.error || '操作失败');
    location.href = '/app';
  } catch (err) {
    showError(err.message);
    btn.disabled = false;
    btn.textContent = label;
  } finally {
    state.busy = false;
  }
}

$('tab-login').addEventListener('click', () => setMode('login'));
$('tab-register').addEventListener('click', () => setMode('register'));
$('form').addEventListener('submit', submit);

(async function init() {
  try {
    const resp = await fetch('/api/auth/me');
    if (resp.ok) {
      const data = await resp.json();
      if (data.ok) {
        location.href = '/app';
        return;
      }
    }
  } catch (_) {}
  const hash = location.hash.replace('#', '');
  setMode(hash === 'register' ? 'register' : 'login');
})();
