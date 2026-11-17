import { AccountScreen } from '../../parts';

// The admin has no account tab (five tabs is the limit), so the account screen is reached
// from the settings. It is a stack screen, so the header carries a back button.
export default function AdminAccount() {
  return <AccountScreen back />;
}
