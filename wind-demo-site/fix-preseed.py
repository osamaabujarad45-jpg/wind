import io, re

path = r'C:\Users\osama\.local\share\opencode\worktree\b44bf6\wind-demo-2026-11-11\wind-demo-site\demo-mock.js'
s = io.open(path, encoding='utf-8').read()

old_start = s.index('  // Pre-seed a signed-in demo session')
old_end = s.index('  } catch (e) { /* private mode */ }\n', old_start) + len('  } catch (e) { /* private mode */ }\n')

new_block = """  // Pre-seed a signed-in demo session on first load so the demo survives reloads.
  if (!state.token || !state.user) {
    state.token = 'demo-token-seed-' + Math.random().toString(36).slice(2);
    state.user = { id: 1, phone: '0599000782', name: 'Wind Demo', role: 'customer', status: 'active',
      vehicle: null, plate: null, rating: null, createdAt: nowMs() - 30 * 86400e3, email: 'demo@example.test',
      permanentlyApprovedAt: null, phoneVerifiedAt: null, emailVerifiedAt: null };
    save();
  }
  // Keep the app's auth keys consistent with the mock's session, unconditionally.
  try {
    localStorage.setItem('token', state.token);
    localStorage.setItem('onboarded', '1');
    if (!localStorage.getItem('language')) localStorage.setItem('language', 'en');
  } catch (e) { /* private mode */ }
"""

s = s[:old_start] + new_block + s[old_end:]
io.open(path, 'w', encoding='utf-8', newline='\n').write(s)
print('patched pre-seed block')
