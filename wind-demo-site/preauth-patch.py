import io
f = r'C:\Users\osama\.local\share\opencode\worktree\b44bf6\wind-demo-2026-11-11\wind-demo-site\demo-mock.js'
s = io.open(f, encoding='utf-8').read()
anchor = "  function save() { try { localStorage.setItem('wind-demo-state', JSON.stringify(state)); } catch (e) { /* private mode */ } }\n"
addition = anchor + """
  // Pre-seed a signed-in demo session on first load so the demo survives reloads.
  if (!state.token) {
    state.token = 'demo-token-seed-' + Math.random().toString(36).slice(2);
    state.user = { id: 1, phone: '0599000782', name: 'Wind Demo', role: 'customer', status: 'active',
      vehicle: null, plate: null, rating: null, createdAt: nowMs() - 30 * 86400e3, email: 'demo@example.test',
      permanentlyApprovedAt: null, phoneVerifiedAt: null, emailVerifiedAt: null };
    save();
  }
  try {
    if (!localStorage.getItem('token')) localStorage.setItem('token', state.token);
    if (!localStorage.getItem('onboarded')) localStorage.setItem('onboarded', '1');
    if (!localStorage.getItem('language')) localStorage.setItem('language', 'en');
  } catch (e) { /* private mode */ }
"""
if anchor not in s:
    raise SystemExit('anchor not found')
s = s.replace(anchor, addition, 1)
io.open(f, 'w', encoding='utf-8', newline='\n').write(s)
print('patched')
