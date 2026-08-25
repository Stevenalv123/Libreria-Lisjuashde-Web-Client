import { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import HeroSlider from './HeroSlider';
import ProductGrid from './ProductGrid';

export default function StoreView() {
  const { currentCategory, setCurrentCategory, categories } = useApp();
  const [search, setSearch] = useState('');
  const anchorRef = useRef(null);

  const scrollToProducts = () => {
    anchorRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="py-6 space-y-8">
      <HeroSlider scrollToProducts={scrollToProducts} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div ref={anchorRef} className="space-y-6 pt-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-2 overflow-x-auto pb-2 md:pb-0">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCurrentCategory(cat)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${currentCategory === cat ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="relative min-w-[260px]">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <i className="fa-solid fa-magnifying-glass"></i>
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o materia..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all"
              />
            </div>
          </div>

          <ProductGrid search={search} />
        </div>
      </div>
    </div>
  );
}
