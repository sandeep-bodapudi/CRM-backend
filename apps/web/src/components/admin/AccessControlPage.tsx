import React, { useState } from 'react';
import { KeyRound, UserCog } from 'lucide-react';
import { RoleChangePage } from './RoleChangePage';
import { PermissionsPage } from './PermissionsPage';

/**
 * Roles & Access — MD + Admin.
 *
 * Changing someone's roles and adjusting what a role (or one person) is
 * allowed to do used to live only inside the technical Admin's "Super Admin"
 * hub, so the MD — who owns these decisions — had no way to make them. The
 * backend already allowed MD for both; this page just gives the MD the
 * same two screens without the rest of the technical admin tools.
 */
export const AccessControlPage: React.FC = () => {
  const [tab, setTab] = useState<'roles' | 'permissions'>('roles');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900">Roles &amp; Access</h1>
        <p className="text-xs text-slate-500 mt-1">
          Give employees one or more roles, and fine-tune what each role — or one person — is
          allowed to do. Changes log the person out so their new access applies immediately.
        </p>
      </div>

      <div className="flex gap-2 bg-slate-100 p-1 rounded-2xl w-full sm:w-auto sm:inline-flex">
        {(
          [
            { id: 'roles', label: 'Employee roles', icon: UserCog },
            { id: 'permissions', label: 'Role permissions', icon: KeyRound },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              tab === t.id
                ? 'bg-white text-navy-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'roles' ? <RoleChangePage /> : <PermissionsPage />}
    </div>
  );
};
