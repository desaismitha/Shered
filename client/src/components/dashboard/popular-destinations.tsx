import { destinations } from "@/data/destinations";

export function PopularDestinations() {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-neutral-900">Popular Destinations</h2>
        <a href="#" className="text-sm font-medium text-primary-600 hover:text-primary-700">Browse all</a>
      </div>
      
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {destinations.map((destination) => (
          <div key={destination.id} className="group relative h-40 rounded-lg overflow-hidden shadow">
            <img 
              src={destination.imageUrl} 
              alt={destination.name} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent group-hover:from-black/80 transition-colors duration-300 flex items-end">
              <div className="p-3 text-white">
                <h3 className="font-medium text-sm">{destination.name}</h3>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
