import { PRODUCTS } from '@/lib/data';
import { ProductDetailClient } from './ProductDetailClient';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

export async function generateStaticParams() {
  return PRODUCTS.map((product) => ({
    slug: product.id,
  }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const product = PRODUCTS.find((p) => p.id === resolvedParams.slug);
  if (!product) return { title: 'Not Found' };
  
  return {
    title: `${product.name} | Canadian Prop Money`,
    description: product.description,
    alternates: {
      canonical: `https://canadianpropmoney.org/products/${product.id}`,
    }
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const product = PRODUCTS.find((p) => p.id === resolvedParams.slug);

  if (!product) {
    notFound();
  }

  // Find related products (just picking others up to 4)
  const relatedProducts = PRODUCTS.filter(p => p.id !== product.id).slice(0, 4);

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://canadianpropmoney.org'
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Products',
        item: 'https://canadianpropmoney.org/products'
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: product.name,
        item: `https://canadianpropmoney.org/products/${product.id}`
      }
    ]
  };

  const currencyCode = product.category.includes('Canadian') ? 'CAD' : product.category.includes('US') ? 'USD' : product.category.includes('Australian') ? 'AUD' : product.category.includes('Euro') ? 'EUR' : product.category.includes('UK') || product.category.includes('Pound') ? 'GBP' : 'USD';

  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: `https://canadianpropmoney.org${product.image || '/hero1.png'}`,
    description: product.description,
    sku: `CPM-${product.id.toUpperCase()}`,
    brand: {
      '@type': 'Brand',
      name: 'Canadian Prop Money'
    },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: currencyCode,
      lowPrice: product.variants[0].price.toString(),
      highPrice: product.variants[product.variants.length - 1].price.toString(),
      offerCount: product.variants.length.toString(),
      availability: 'https://schema.org/InStock',
      url: `https://canadianpropmoney.org/products/${product.id}`
    }
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }} />

      <div className="bg-background min-h-screen pt-12 pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ProductDetailClient product={product} />

          <div className="mt-32 pt-16 border-t border-white/5">
            <h2 className="text-3xl font-light text-white tracking-tight mb-8">Related Products</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
               {relatedProducts.map(rp => (
                  <Link key={rp.id} href={`/products/${rp.id}`} className="block group">
                    <div className="relative aspect-[4/3] overflow-hidden mb-4 bg-black/40 border border-white/10">
                      <Image src={rp.image || "/hero1.png"} alt={rp.name} fill className="object-cover group-hover:scale-105 transition duration-500" referrerPolicy="no-referrer" />
                    </div>
                    <h3 className="font-bold text-lg text-white mb-1 line-clamp-1 group-hover:text-primary transition">{rp.name}</h3>
                    <p className="text-gray-400 font-mono mb-2">From ${rp.variants[0].price}</p>
                  </Link>
               ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
