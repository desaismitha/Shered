import { activities } from "@/data/activities";
import { Badge } from "@/components/ui/badge";

export function GroupActivities() {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-neutral-900">Popular Group Activities</h2>
        <a href="#" className="text-sm font-medium text-primary-600 hover:text-primary-700">Browse all</a>
      </div>
      
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {activities.map((activity) => (
          <div key={activity.id} className="bg-white shadow rounded-lg overflow-hidden hover:shadow-md transition-shadow">
            <div className="h-40 overflow-hidden">
              <img 
                src={activity.imageUrl} 
                alt={activity.title} 
                className="w-full h-full object-cover" 
              />
            </div>
            <div className="p-4">
              <h3 className="font-bold text-neutral-900">{activity.title}</h3>
              <p className="text-sm text-neutral-500 mt-1">{activity.description}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {activity.tags.map((tag, idx) => (
                  <Badge 
                    key={idx} 
                    variant="outline"
                    className={`bg-${tag.color}-100 text-${tag.color}-800 border-${tag.color}-200`}
                  >
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
