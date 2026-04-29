import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  useGetTicket, 
  useCreateTicket, 
  useUpdateTicket, 
  useListSites,
  getListTicketsQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetRecentActivityQueryKey,
  getGetSiteStatusQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from "@/components/ui/drawer";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";

const createSchema = z.object({
  siteId: z.coerce.number().min(1, "Site is required"),
  title: z.string().min(3, "Title must be at least 3 characters"),
  type: z.enum(["power", "telecom"]),
  priority: z.enum(["critical", "high", "medium", "low"]),
  description: z.string().optional(),
  assignedTo: z.string().optional(),
});

const updateSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "closed"]),
  priority: z.enum(["critical", "high", "medium", "low"]),
  assignedTo: z.string().optional(),
  description: z.string().optional(),
});

interface TicketDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: number | null;
  isNew?: boolean;
}

export function TicketDrawer({ open, onOpenChange, ticketId, isNew = false }: TicketDrawerProps) {
  const { data: ticket, isLoading: loadingTicket } = useGetTicket(ticketId || 0, {
    query: { enabled: !!ticketId && !isNew }
  });
  const { data: sites } = useListSites({ query: { enabled: open } });
  
  const createMutation = useCreateTicket();
  const updateMutation = useUpdateTicket();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createForm = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      siteId: 0,
      title: "",
      type: "power",
      priority: "high",
      description: "",
      assignedTo: ""
    }
  });

  const updateForm = useForm<z.infer<typeof updateSchema>>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      status: "open",
      priority: "high",
      description: "",
      assignedTo: ""
    }
  });

  const initRef = useRef<number | null>(null);

  useEffect(() => {
    if (isNew) {
      createForm.reset({
        siteId: 0,
        title: "",
        type: "power",
        priority: "high",
        description: "",
        assignedTo: ""
      });
      initRef.current = null;
    } else if (ticket && initRef.current !== ticket.id) {
      initRef.current = ticket.id;
      updateForm.reset({
        status: ticket.status as any,
        priority: ticket.priority as any,
        description: ticket.description || "",
        assignedTo: ticket.assignedTo || ""
      });
    }
  }, [ticket, isNew, createForm, updateForm]);

  const onInvalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListTicketsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSiteStatusQueryKey() });
  };

  const onCreateSubmit = (data: z.infer<typeof createSchema>) => {
    createMutation.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Ticket created successfully" });
        onInvalidate();
        onOpenChange(false);
      },
      onError: (err) => {
        toast({ title: "Failed to create ticket", description: String(err), variant: "destructive" });
      }
    });
  };

  const onUpdateSubmit = (data: z.infer<typeof updateSchema>) => {
    if (!ticketId) return;
    const isResolving = data.status === "resolved" && ticket?.status !== "resolved";
    const payload = {
      ...data,
      resolvedAt: isResolving ? new Date().toISOString() : undefined
    };

    updateMutation.mutate({ id: ticketId, data: payload }, {
      onSuccess: () => {
        toast({ title: "Ticket updated successfully" });
        onInvalidate();
        onOpenChange(false);
      },
      onError: (err) => {
        toast({ title: "Failed to update ticket", description: String(err), variant: "destructive" });
      }
    });
  };

  if (!isNew && !ticket && loadingTicket) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} direction="right">
        <DrawerContent className="w-full sm:w-[500px] h-full rounded-t-none ml-auto border-l border-border bg-background">
          <div className="p-6 h-full flex items-center justify-center text-muted-foreground">Loading ticket details...</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="w-full sm:w-[500px] h-full rounded-t-none ml-auto border-l border-border bg-background flex flex-col">
        <DrawerHeader className="border-b border-border text-left px-6 py-4">
          {isNew ? (
            <>
              <DrawerTitle className="text-xl">New Incident Ticket</DrawerTitle>
              <DrawerDescription>Create a new ticket for a site outage or maintenance issue.</DrawerDescription>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-start">
                <DrawerTitle className="text-xl">{ticket?.title}</DrawerTitle>
                <Badge variant="outline" className={
                  ticket?.status === "open" ? "bg-red-500/10 text-red-500 border-red-500/20" :
                  ticket?.status === "in_progress" ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                  ticket?.status === "resolved" ? "bg-green-500/10 text-green-500 border-green-500/20" :
                  "bg-gray-500/10 text-gray-400 border-gray-500/20"
                }>
                  {ticket?.status?.replace("_", " ").toUpperCase()}
                </Badge>
              </div>
              <div className="flex gap-2 text-xs text-muted-foreground font-mono">
                <span>ID: #{ticket?.id}</span>
                <span>•</span>
                <span>SITE: {ticket?.siteName}</span>
                <span>•</span>
                <span>{ticket?.createdAt && format(parseISO(ticket.createdAt), "MMM dd, yyyy HH:mm")}</span>
              </div>
            </div>
          )}
        </DrawerHeader>

        <div className="flex-1 overflow-auto px-6 py-6">
          {isNew ? (
            <Form {...createForm}>
              <form id="create-ticket-form" onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                <FormField
                  control={createForm.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="E.g. Generator failure" {...field} className="bg-black/20" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="siteId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Site</FormLabel>
                      <Select onValueChange={(val) => field.onChange(Number(val))} value={field.value ? String(field.value) : undefined}>
                        <FormControl>
                          <SelectTrigger className="bg-black/20">
                            <SelectValue placeholder="Select a site" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sites?.map(site => (
                            <SelectItem key={site.id} value={String(site.id)}>
                              {site.name} ({site.zone})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={createForm.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-black/20">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="power">Power</SelectItem>
                            <SelectItem value="telecom">Telecom</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-black/20">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="critical">Critical</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={createForm.control}
                  name="assignedTo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assignee</FormLabel>
                      <FormControl>
                        <Input placeholder="Engineer name or ID" {...field} className="bg-black/20" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description / Notes</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Details about the incident..." className="h-32 bg-black/20" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          ) : (
            <Form {...updateForm}>
              <form id="update-ticket-form" onSubmit={updateForm.handleSubmit(onUpdateSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={updateForm.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-black/20">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={updateForm.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-black/20">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="critical">Critical</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={updateForm.control}
                  name="assignedTo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assignee</FormLabel>
                      <FormControl>
                        <Input {...field} className="bg-black/20" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={updateForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description / Notes</FormLabel>
                      <FormControl>
                        <Textarea className="h-32 bg-black/20" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          )}
        </div>

        <DrawerFooter className="border-t border-border px-6 py-4 flex-row justify-end gap-2">
          <DrawerClose asChild>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
          <Button 
            type="submit" 
            form={isNew ? "create-ticket-form" : "update-ticket-form"}
            disabled={isNew ? createMutation.isPending : updateMutation.isPending}
          >
            {isNew ? "Create Ticket" : "Update Ticket"}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
