import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guard";
import { apiJson, type UsersPage } from "@/lib/api";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const roleBadgeClass: Record<string, string> = {
  admin: "bg-primary-600/20 text-primary-300",
  operator: "bg-sky-600/20 text-sky-300",
  edo: "bg-violet-600/20 text-violet-300",
  member: "bg-neutral-700/50 text-neutral-300",
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const requestedPage = Math.max(1, Number(params.page) || 1);

  const data = await apiJson<UsersPage>(
    `/v1/admin/users?page=${requestedPage}&pageSize=${PAGE_SIZE}`,
  );
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-100">Users</h1>
        <p className="text-sm text-neutral-400 mt-1">
          {data.total} registered user{data.total === 1 ? "" : "s"} across the
          platform.
        </p>
      </div>

      <div className="bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-neutral-500 border-b border-neutral-800">
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Signed up</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {data.items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                  No users on this page.
                </td>
              </tr>
            )}
            {data.items.map((user) => (
              <tr key={user.id} className="hover:bg-neutral-800/40 transition-colors">
                <td className="px-4 py-3 font-medium text-neutral-100">{user.email}</td>
                <td className="px-4 py-3 text-neutral-300">{user.name ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${roleBadgeClass[user.role] ?? roleBadgeClass.member}`}
                  >
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-400">{formatDate(user.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-neutral-500">
            Page {data.page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <PageLink page={data.page - 1} disabled={data.page <= 1} label="Previous" />
            <PageLink page={data.page + 1} disabled={data.page >= totalPages} label="Next" />
          </div>
        </div>
      )}
    </div>
  );
}

function PageLink({
  page,
  disabled,
  label,
}: {
  page: number;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return (
      <span className="px-3 py-1.5 rounded-lg text-sm font-medium text-neutral-700 border border-neutral-800 cursor-default">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={`/dashboard/users?page=${page}`}
      className="px-3 py-1.5 rounded-lg text-sm font-medium text-neutral-300 border border-neutral-800 hover:bg-neutral-800 hover:text-neutral-100 transition-colors"
    >
      {label}
    </Link>
  );
}
