import Navbar from './Navbar'

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />
      <main className="flex-1">
        {children}
      </main>
      <footer className="bg-green-900 text-green-200 text-center py-4 text-sm">
        &copy; {new Date().getFullYear()} Mufumbu Secondary School — All rights reserved
      </footer>
    </div>
  )
}
