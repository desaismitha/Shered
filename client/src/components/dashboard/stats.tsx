import { Calendar, Users, DollarSign, MessageSquare } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Link } from "wouter";

interface Stat {
  title: string;
  value: string | number;
  icon: typeof Calendar;
  iconBgColor: string;
  iconColor: string;
  href: string;
  linkText: string;
}

export function DashboardStats() {
  const stats: Stat[] = [
    {
      title: "Upcoming Trips",
      value: 3,
      icon: Calendar,
      iconBgColor: "bg-primary-100",
      iconColor: "text-primary-600",
      href: "/trips",
      linkText: "View all trips"
    },
    {
      title: "Active Groups",
      value: 5,
      icon: Users,
      iconBgColor: "bg-orange-100",
      iconColor: "text-orange-600",
      href: "/groups",
      linkText: "View all groups"
    },
    {
      title: "Shared Expenses",
      value: "$1,245",
      icon: DollarSign,
      iconBgColor: "bg-emerald-100",
      iconColor: "text-emerald-600",
      href: "/expenses",
      linkText: "View details"
    },
    {
      title: "Unread Messages",
      value: 12,
      icon: MessageSquare,
      iconBgColor: "bg-primary-100",
      iconColor: "text-primary-600",
      href: "/messages",
      linkText: "View messages"
    },
  ];
  
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
      {stats.map((stat, index) => (
        <Card key={index} className="overflow-hidden">
          <CardContent className="pt-6">
            <div className="flex items-center">
              <div className={`flex-shrink-0 ${stat.iconBgColor} rounded-md p-3`}>
                <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-neutral-500 truncate">{stat.title}</dt>
                  <dd>
                    <div className="text-lg font-medium text-neutral-900">{stat.value}</div>
                  </dd>
                </dl>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-neutral-50 px-4 py-3 border-t border-neutral-200 text-sm">
            <Link href={stat.href} className="font-medium text-primary-600 hover:text-primary-500">
              {stat.linkText}
            </Link>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
