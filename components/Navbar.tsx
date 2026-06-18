'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

const NAV_LINKS = [
  { name: 'Home', href: '/' },
  { name: 'Shop', href: '/products' },
  { name: 'About', href: '/about' },
  { name: 'Blog', href: '/blog' },
  { name: 'FAQs', href: '/faq' },
  { name: 'Track Order', href: '/track-order' },
  { name: 'Contact', href: '/contact' },
];

export function Navbar() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 w-full backdrop-blur-md bg-background/90 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <div className="relative w-48 h-14">
                <Image 
                  src="/wunba.webp" 
                  alt="Canadian Prop Money Logo" 
                  fill 
                  className="object-contain object-left" 
                  referrerPolicy="no-referrer"
                  sizes="(max-width: 768px) 100vw, 200px"
                  priority
                />
              </div>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-8 text-sm font-medium tracking-wide uppercase text-gray-400">
              {NAV_LINKS.map(link => (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`transition-colors hover:text-primary ${
                    pathname === link.href ? 'text-white' : ''
                  }`}
                >
                  {link.name}
                </Link>
              ))}
              <Link 
                href="/products" 
                className="px-6 py-2 bg-white text-black text-xs font-bold uppercase tracking-widest hover:bg-gray-200 transition-colors"
              >
                Order Now
              </Link>
            </nav>

            {/* Mobile Nav Toggle */}
            <button 
              className="md:hidden p-2 text-text"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-background flex flex-col items-center justify-center pt-20">
          <nav className="flex flex-col items-center gap-8 text-2xl font-syne font-bold">
            {NAV_LINKS.map(link => (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={pathname === link.href ? 'text-primary' : 'text-text'}
              >
                {link.name}
              </Link>
            ))}
            <Link 
              href="/products" 
              onClick={() => setIsMobileMenuOpen(false)}
              className="bg-btn-primary text-white px-8 py-3 rounded-md mt-4"
            >
              Order Now
            </Link>
          </nav>
        </div>
      )}
    </>
  );
}
