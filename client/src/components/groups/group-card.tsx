import { Users } from "lucide-react";
import { Group } from "@shared/schema";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { GroupMember, User } from "@shared/schema";

interface GroupCardProps {
  group: Group;
}

export function GroupCard({ group }: GroupCardProps) {
  // Get group members
  const { data: groupMembers } = useQuery<GroupMember[]>({
    queryKey: ["/api/groups", group.id, "members"],
  });

  // Get trips for this group
  const { data: trips } = useQuery({
    queryKey: ["/api/groups", group.id, "trips"],
  });

  // Get users for member details
  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: !!groupMembers,
  });

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      <div className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="flex-shrink-0 bg-primary-100 rounded-md p-2">
              <Users className="h-5 w-5 text-primary-600" />
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-semibold text-neutral-900">{group.name}</h3>
              <p className="text-sm text-neutral-500">
                {groupMembers?.length || 0} members • {trips?.length || 0} trips
              </p>
            </div>
          </div>
        </div>

        {group.description && (
          <p className="mt-3 text-sm text-neutral-600 line-clamp-2">
            {group.description}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between">
          <div className="flex -space-x-2">
            {groupMembers && users ? (
              groupMembers.slice(0, 5).map((member) => {
                const user = users.find(u => u.id === member.userId);
                return (
                  <div 
                    key={member.id}
                    className="w-8 h-8 rounded-full bg-neutral-300 border-2 border-white flex items-center justify-center text-xs text-neutral-600"
                  >
                    {user?.displayName?.[0] || user?.username?.[0] || "U"}
                  </div>
                );
              })
            ) : (
              Array(3).fill(0).map((_, index) => (
                <div 
                  key={index}
                  className="w-8 h-8 rounded-full bg-neutral-300 border-2 border-white flex items-center justify-center text-xs text-neutral-600"
                />
              ))
            )}
            {groupMembers && groupMembers.length > 5 && (
              <div className="w-8 h-8 rounded-full bg-neutral-200 border-2 border-white flex items-center justify-center text-xs text-neutral-600">
                +{groupMembers.length - 5}
              </div>
            )}
          </div>
          <Link 
            href={`/groups/${group.id}`}
            className="text-primary-600 hover:text-primary-700 text-sm font-medium"
          >
            View Group
          </Link>
        </div>
      </div>
    </div>
  );
}
