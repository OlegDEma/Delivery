import { Sidebar } from '@/components/layout/sidebar';
import { MobileNav } from '@/components/layout/mobile-nav';
import { Toaster } from '@/components/ui/sonner';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <MobileNav />
      <main className="md:ml-64">
        <div className="p-4 md:p-6 max-w-7xl">
          {children}
        </div>
      </main>
      <Toaster position="top-right" richColors />
    </div>
  );
}
