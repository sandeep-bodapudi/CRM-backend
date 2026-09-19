import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';

// Employees required to scan the kiosk must not be able to end their app
// session before 6:00 PM IST unless they've filed an emergency early-logout
// request for today (apps/api/src/routes/attendance/proposals.ts's
// /early-logout-proposal, auto-approved on submit). MD/HR/Admin and anyone
// with attendanceRequired = false are exempt, mirroring the same exemption
// QRScannerModal already applies for kiosk scanning.
export function useLogoutGate() {
  const { user, fetchWithAuth } = useAuth();

  const canLogoutNow = async (): Promise<boolean> => {
    if (!user || user.attendanceRequired === false) return true;

    const istHour = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        hour12: false,
      }).format(new Date()),
    );
    if (istHour >= 18) return true;

    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/attendance/proposals/my`);
      if (!res.ok) return false;
      const data = await res.json();
      const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
        new Date(),
      );
      return (data.proposals || []).some((p: any) => {
        if (p.type !== 'EARLY_CHECKOUT' || p.status !== 'APPROVED') return false;
        const proposalDateIST = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Kolkata',
        }).format(new Date(p.target_date));
        return proposalDateIST === todayIST;
      });
    } catch {
      return false;
    }
  };

  return { canLogoutNow };
}
