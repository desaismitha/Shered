import { Expense, User } from "@shared/schema";
import { format } from "date-fns";
import { DollarSign, Calendar, Tag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ExpenseCardProps {
  expense: Expense;
  users: User[];
}

export function ExpenseCard({ expense, users }: ExpenseCardProps) {
  // Find the user who paid
  const paidByUser = users.find(user => user.id === expense.paidBy);
  
  // Calculate cost per person
  const perPersonAmount = expense.splitAmong.length > 0 
    ? expense.amount / expense.splitAmong.length 
    : expense.amount;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">
              {expense.title}
            </h3>
            <div className="flex items-center text-sm text-neutral-500 mt-1">
              <Calendar className="h-4 w-4 mr-1" />
              {format(new Date(expense.date), 'MMM d, yyyy')}
              
              {expense.category && (
                <>
                  <span className="mx-2">•</span>
                  <Tag className="h-4 w-4 mr-1" />
                  {expense.category}
                </>
              )}
            </div>
          </div>
          <div className="mt-2 md:mt-0">
            <span className="text-lg font-semibold text-neutral-900">
              ${(expense.amount / 100).toFixed(2)}
            </span>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div className="mb-3 sm:mb-0">
            <p className="text-sm text-neutral-600 mb-1">
              Paid by{" "}
              <span className="font-medium">
                {paidByUser?.displayName || paidByUser?.username || "Unknown"}
              </span>
            </p>
            <p className="text-sm text-neutral-600">
              Split among {expense.splitAmong.length} people
              {expense.splitAmong.length > 0 && (
                <span className="ml-1">
                  (${(perPersonAmount / 100).toFixed(2)} each)
                </span>
              )}
            </p>
          </div>
          
          <div className="flex -space-x-2">
            {expense.splitAmong.slice(0, 5).map((userId, index) => {
              const user = users.find(u => u.id === userId);
              return (
                <div 
                  key={`${userId}-${index}`} 
                  className="w-8 h-8 rounded-full bg-neutral-200 border-2 border-white flex items-center justify-center text-xs text-neutral-600"
                  title={user?.displayName || user?.username || "Unknown User"}
                >
                  {user?.displayName?.[0] || user?.username?.[0] || "?"}
                </div>
              );
            })}
            
            {expense.splitAmong.length > 5 && (
              <div className="w-8 h-8 rounded-full bg-neutral-200 border-2 border-white flex items-center justify-center text-xs text-neutral-600">
                +{expense.splitAmong.length - 5}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
