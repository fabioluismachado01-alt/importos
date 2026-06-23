import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { AppSidebar, SidebarProvider } from '@/components/layout/AppSidebar'
import { AppTopbar } from '@/components/layout/AppTopbar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden" style={{ background: '#F8FAFD' }}>
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          <AppTopbar user={user} />
          <main className="flex-1 overflow-y-auto p-3 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
