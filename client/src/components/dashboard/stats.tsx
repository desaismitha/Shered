import { Calendar, Users, DollarSign, MessageSquare } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Trip, Group, Expense, Message } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

interface Stat {
  title: string;
  value: string | number;
  icon: typeof Calendar;
  iconBgColor: string;
  iconColor: string;
  href: string;
  linkText: string;
  isLoading?: boolean;
}

export function DashboardStats() {
  // Fetch trips data
  const { data: trips, isLoading: tripsLoading } = useQuery<Trip[]>({
    queryKey: ["/api/trips"],
    staleTime: 1000 * 60, // 1 minute
  });

  // Fetch groups data
  const { data: groups, isLoading: groupsLoading } = useQuery<Group[]>({
    queryKey: ["/api/groups"],
    staleTime: 1000 * 60, // 1 minute
  });

  // Fetch expenses data
  const { data: expenses, isLoading: expensesLoading } = useQuery<Expense[]>({
    queryKey: ["/api/expenses"],
    staleTime: 1000 * 60, // 1 minute
  });

  // Fetch messages data
  const { data: messages, isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/messages"],
    staleTime: 1000 * 60, // 1 minute
  });

  // Calculate upcoming trips count based on actual user's trips
  // Get the upcoming trips (future start date)
  const upcomingTrips = !tripsLoading && trips
    ? trips.filter(trip => new Date(trip.startDate) > new Date())
    : [];
  
  // Use the actual count from the user's trips
  const upcomingTripsCount = upcomingTrips.length;
  
  // For debugging
  console.log("All trips:", trips);
  console.log("Upcoming trips count:", upcomingTripsCount);

  // Calculate active groups count
  const activeGroupsCount = !groupsLoading && groups ? groups.length : 0;

  // Calculate expenses - should add up to $32.97
  const totalExpenses = !expensesLoading && expenses
    ? expenses.reduce((total, expense) => {
        // Make sure expense.amount is a valid number
        if (expense.amount === null || expense.amount === undefined) {
          return total;
        }
        
        // Convert to numeric value
        let amount = typeof expense.amount === 'number' 
          ? expense.amount 
          : parseFloat(String(expense.amount));
        
        // Always divide by 100 to convert cents to dollars
        return isNaN(amount) ? total : total + (amount / 100);
      }, 0)
    : 0;
  
  // For debugging
  console.log("All expenses:", expenses);
  console.log("Total expenses calculated:", totalExpenses);
  
  // Format the expense amount as currency
  const formattedExpenses = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(totalExpenses);

  // Calculate unread messages count (assuming all are unread for now)
  // In a real implementation, you'd filter by read/unread status
  const unreadMessagesCount = !messagesLoading && messages ? messages.length : 0;

  const stats: Stat[] = [
    {
      title: "Upcoming Trips",
      value: tripsLoading ? "..." : upcomingTripsCount,
      icon: Calendar,
      iconBgColor: "bg-primary-100",
      iconColor: "text-primary-600",
      href: "/trips",
      linkText: "View all trips",
      isLoading: tripsLoading
    },
    {
      title: "Active Groups",
      value: groupsLoading ? "..." : activeGroupsCount,
      icon: Users,
      iconBgColor: "bg-orange-100",
      iconColor: "text-orange-600",
      href: "/groups",
      linkText: "View all groups",
      isLoading: groupsLoading
    },
    {
      title: "Shared Expenses",
      value: expensesLoading ? "..." : formattedExpenses,
      icon: DollarSign,
      iconBgColor: "bg-emerald-100",
      iconColor: "text-emerald-600",
      href: "/expenses",
      linkText: "View details",
      isLoading: expensesLoading
    },
    {
      title: "Unread Messages",
      value: messagesLoading ? "..." : unreadMessagesCount,
      icon: MessageSquare,
      iconBgColor: "bg-primary-100",
      iconColor: "text-primary-600",
      href: "/messages",
      linkText: "View messages",
      isLoading: messagesLoading
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
                    {stat.isLoading ? (
                      <Skeleton className="h-6 w-16" />
                    ) : (
                      <div className="text-lg font-medium text-neutral-900">{stat.value}</div>
                    )}
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
