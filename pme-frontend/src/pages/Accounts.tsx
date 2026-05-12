import { useEffect, useMemo, useState } from "react";
import { KeyRound, PenLine, Plus, Search } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Topbar } from "@/components/layout/Topbar";
import { AddUserModal } from "@/components/modals/account_management/AddUserModal";
import { EditUserModal } from "@/components/modals/account_management/EditUserModal";
import { ResetPasswordModal } from "@/components/modals/account_management/ResetPasswordModal";
import {
  createUser,
  getMyProfile,
  listUsers,
  resetUserPassword,
  roleBadgeClass,
  roleLabel,
  updateUser,
  type AccountStatus,
  type AccessRole,
  type CreateUserPayload,
  type UpdateUserPayload,
  type UserAccount,
} from "@/services/user.service";
import { listOffices, type OfficeConfig } from "@/services/settings.service";

export default function AccountsPage() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [offices, setOffices] = useState<OfficeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<AccessRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<AccountStatus | "all">("all");

  const [editing, setEditing] = useState<UserAccount | null>(null);
  const [resetting, setResetting] = useState<UserAccount | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const [items, officeItems, profile] = await Promise.all([
        listUsers(),
        listOffices(),
        getMyProfile(),
      ]);
      setUsers(items);
      setOffices(officeItems);
      setCurrentUserId(profile.user_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load user accounts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return users.filter((user) => {
      if (roleFilter !== "all" && user.role_name !== roleFilter) return false;
      if (statusFilter !== "all" && user.status !== statusFilter) return false;
      if (!q) return true;

      return (
        user.full_name.toLowerCase().includes(q) ||
        user.username.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        (user.office_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [users, query, roleFilter, statusFilter]);

  const stats = useMemo(() => {
    const admins = users.filter((u) => u.role_name === "ADMIN").length;
    const staff = users.filter((u) => u.role_name === "STAFF").length;
    const active = users.filter((u) => u.is_active).length;
    const rate = users.length === 0 ? 0 : (active / users.length) * 100;

    return {
      admins,
      staff,
      active,
      rate,
      total: users.length,
    };
  }, [users]);

  const openEdit = (user: UserAccount) => {
    setEditing(user);
    setEditOpen(true);
  };

  const openReset = (user: UserAccount) => {
    setResetting(user);
    setResetOpen(true);
  };

  const handleCreate = async (payload: CreateUserPayload) => {
    await createUser(payload);
    await loadUsers();
  };

  const handleSave = async (payload: UpdateUserPayload) => {
    if (!editing) return;
    await updateUser(editing.user_id, payload);
    await loadUsers();
  };

  const handleResetPassword = async (payload: { new_password: string }) => {
    if (!resetting) return;
    await resetUserPassword(resetting.user_id, payload);
    await loadUsers();
  };

  return (
    <AppShell>
      <Topbar title="Account Management" />

      <div className="flex flex-1 flex-col overflow-hidden p-6">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <nav className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <span>Admin</span>
              <span>/</span>
              <span className="text-foreground">Account Management</span>
            </nav>
            <h2 className="text-3xl font-black tracking-tight text-foreground">
              Account Management
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Create, edit, and reset system accounts.
            </p>
          </div>

          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New Account
          </button>
        </div>

        {error ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="mb-5 grid grid-cols-12 gap-4">
          <div className="col-span-12 rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Total Users
            </p>
            <div className="mt-3 flex items-end justify-between">
              <span className="text-4xl font-black tracking-tight">{stats.total}</span>
              <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
                {stats.active} active
              </span>
            </div>
          </div>

          <div className="col-span-12 rounded-xl bg-primary p-5 text-primary-foreground shadow-sm lg:col-span-9">
            <h3 className="text-lg font-black tracking-tight">System Access Overview</h3>
            <p className="mt-1 max-w-2xl text-sm text-primary-foreground/80">
              Role assignment is limited to the system roles supported by the backend:
              ADMIN and STAFF.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric label="Administrators" value={stats.admins} />
              <Metric label="Staff" value={stats.staff} />
              <Metric label="Active Users" value={stats.active} />
              <Metric label="Active Rate" value={`${stats.rate.toFixed(0)}%`} />
            </div>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, username, or email"
              className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as AccessRole | "all")}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All Roles</option>
            <option value="ADMIN">Administrator</option>
            <option value="STAFF">Staff</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as AccountStatus | "all")}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          <button
            onClick={() => {
              setQuery("");
              setRoleFilter("all");
              setStatusFilter("all");
            }}
            className="text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Reset
          </button>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Username</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Office</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-muted-foreground">
                      Loading users...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-muted-foreground">
                      No users match the current filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((user) => {
                    const isCurrentUser = currentUserId === user.user_id;
                    return (
                    <tr key={user.user_id} className="border-t border-border/60 hover:bg-muted/40">
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {user.full_name}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {user.username}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {user.email}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {user.office_name ?? "Not assigned"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded px-2 py-1 text-[10px] font-semibold uppercase ${roleBadgeClass(user.role_name)}`}
                        >
                          {roleLabel(user.role_name)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded px-2 py-1 text-[10px] font-semibold uppercase ${
                            user.is_active
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {user.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isCurrentUser ? null : (
                          <div className="flex items-center justify-end gap-2">
                            <IconActionButton
                              title="Edit user"
                              onClick={() => openEdit(user)}
                            >
                              <PenLine className="h-4 w-4" />
                            </IconActionButton>

                            <IconActionButton
                              title="Reset password"
                              onClick={() => openReset(user)}
                            >
                              <KeyRound className="h-4 w-4" />
                            </IconActionButton>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AddUserModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreate={handleCreate}
        offices={offices}
      />

      <EditUserModal
        user={editing}
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditing(null);
        }}
        onSave={handleSave}
        offices={offices}
      />

      <ResetPasswordModal
        user={resetting}
        open={resetOpen}
        onOpenChange={(open) => {
          setResetOpen(open);
          if (!open) setResetting(null);
        }}
        onSubmit={handleResetPassword}
      />
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-primary-foreground/10 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-primary-foreground/75">
        {label}
      </p>
      <p className="mt-1 text-lg font-black leading-none text-primary-foreground">
        {value}
      </p>
    </div>
  );
}

function IconActionButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}
