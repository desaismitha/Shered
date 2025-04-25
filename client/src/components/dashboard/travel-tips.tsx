import { travelTips } from "@/data/travel-tips";
import { ArrowRight, Calendar, DollarSign } from "lucide-react";

export function TravelTips() {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-neutral-900">Travel Planning Tips</h2>
        <a href="#" className="text-sm font-medium text-primary-600 hover:text-primary-700">View all tips</a>
      </div>
      
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {travelTips.slice(0, 2).map((tip) => (
          <div key={tip.id} className="bg-white shadow rounded-lg overflow-hidden hover:shadow-md transition-shadow">
            <div className="p-5">
              <div className="flex items-start">
                <div className={`flex-shrink-0 ${tip.iconBg} rounded-md p-2`}>
                  {tip.icon === "calendar" ? (
                    <Calendar className={`h-5 w-5 ${tip.iconColor}`} />
                  ) : (
                    <DollarSign className={`h-5 w-5 ${tip.iconColor}`} />
                  )}
                </div>
                <div className="ml-4">
                  <h3 className="font-bold text-neutral-900">{tip.title}</h3>
                  <p className="text-sm text-neutral-600 mt-1">{tip.content}</p>
                  <a href="#" className="mt-3 text-sm font-medium text-primary-600 hover:text-primary-700 inline-flex items-center">
                    Learn more
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
