import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export interface Activity {
  id: string;
  description: string;
  user: string | null;
  timestamp: string;
  type: "success" | "info" | "warning";
}

interface RecentActivityProps {
  activities?: Activity[];
  isLoading: boolean;
}

export default function RecentActivity({ activities, isLoading }: RecentActivityProps) {

  const getActivityColor = (type: string) => {
    const colors = {
      success: "bg-success",
      info: "bg-primary",
      warning: "bg-warning",
      error: "bg-destructive",
    };
    return colors[type as keyof typeof colors] || colors.info;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold text-slate-900">Actividad Reciente</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          [...Array(3)].map((_, index) => (
            <div key={index} className="animate-pulse space-y-2">
              <div className="h-3 bg-slate-200 rounded w-5/6" />
              <div className="h-2 bg-slate-200 rounded w-1/3" />
            </div>
          ))
        ) : !activities || activities.length === 0 ? (
          <p className="text-sm text-slate-500">Aún no hay actividad registrada.</p>
        ) : activities.map((activity) => (
          <div key={activity.id} className="flex items-start space-x-3">
            <div className={`w-2 h-2 ${getActivityColor(activity.type)} rounded-full mt-2`}></div>
            <div className="flex-1">
              <p className="text-sm text-slate-900">
                {activity.user && <span className="font-medium">{activity.user}</span>}{" "}
                {activity.description}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true, locale: es })}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
