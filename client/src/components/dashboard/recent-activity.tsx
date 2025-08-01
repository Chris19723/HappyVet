import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RecentActivity() {
  // Mock activity data - in real app this would come from API
  const activities = [
    {
      id: 1,
      description: "completó el tratamiento de Bella",
      user: "Dr. María",
      timestamp: "Hace 15 minutos",
      type: "success",
    },
    {
      id: 2,
      description: "Nueva cita programada para Toby",
      user: null,
      timestamp: "Hace 32 minutos",
      type: "info",
    },
    {
      id: 3,
      description: "Factura #2024-001 generada para Cliente García",
      user: null,
      timestamp: "Hace 1 hora",
      type: "warning",
    },
  ];

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
        {activities.map((activity) => (
          <div key={activity.id} className="flex items-start space-x-3">
            <div className={`w-2 h-2 ${getActivityColor(activity.type)} rounded-full mt-2`}></div>
            <div className="flex-1">
              <p className="text-sm text-slate-900">
                {activity.user && <span className="font-medium">{activity.user}</span>}{" "}
                {activity.description}
              </p>
              <p className="text-xs text-slate-500 mt-1">{activity.timestamp}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
