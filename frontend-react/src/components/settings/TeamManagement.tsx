import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Card,
  CardBody,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Spinner,
} from '@heroui/react';
import type { SharedSelection } from '@heroui/react';
import { CaretDown, PencilSimple, Plus, Trash, UserPlus, UsersThree } from '@phosphor-icons/react';
import { useTeams, type Team, type TeamMember } from '../../hooks/use-teams';
import { useUsers } from '../../hooks/use-users';
import { selectIsAdmin, useAuthStore } from '../../stores/auth';

function firstKey(keys: SharedSelection): string {
  if (keys === 'all') return '';
  if (typeof keys === 'string' || typeof keys === 'number') return String(keys);
  const first = keys[Symbol.iterator]().next();
  return first.done ? '' : String(first.value);
}

export default function TeamManagement() {
  const { teams, loading, error, fetchTeams, createTeam, updateTeam, deleteTeam, fetchMembers, addMember, removeMember } =
    useTeams();
  const { users, fetchUsers } = useUsers();
  const isAdmin = useAuthStore(selectIsAdmin);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [memberMap, setMemberMap] = useState<Record<string, TeamMember[]>>({});

  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [teamName, setTeamName] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');

  useEffect(() => {
    void fetchTeams();
    void fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const availableUsers = useMemo(() => {
    if (!selectedTeam) return users;
    const memberIds = new Set((memberMap[selectedTeam.id] ?? []).map((m) => m.userId));
    return users.filter((u) => !memberIds.has(u.id));
  }, [users, selectedTeam, memberMap]);

  async function toggleTeam(teamId: string) {
    if (expandedId === teamId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(teamId);
    if (!memberMap[teamId]) {
      const members = await fetchMembers(teamId);
      setMemberMap((prev) => ({ ...prev, [teamId]: members }));
    }
  }

  function openCreate() {
    setTeamName('');
    setDialogError('');
    setShowCreate(true);
  }

  function openEdit(team: Team) {
    setSelectedTeam(team);
    setTeamName(team.name);
    setDialogError('');
    setShowEdit(true);
  }

  function openDelete(team: Team) {
    setSelectedTeam(team);
    setShowDelete(true);
  }

  function openAddMember(team: Team) {
    setSelectedTeam(team);
    setSelectedUserId('');
    setDialogError('');
    setShowAddMember(true);
  }

  async function handleCreate() {
    if (!teamName.trim()) return;
    setSaving(true);
    setDialogError('');
    const res = await createTeam(teamName.trim());
    setSaving(false);
    if (res.ok) setShowCreate(false);
    else setDialogError(res.error || '');
  }

  async function handleUpdate() {
    if (!selectedTeam || !teamName.trim()) return;
    setSaving(true);
    setDialogError('');
    const res = await updateTeam(selectedTeam.id, teamName.trim());
    setSaving(false);
    if (res.ok) setShowEdit(false);
    else setDialogError(res.error || '');
  }

  async function handleDelete() {
    if (!selectedTeam) return;
    setSaving(true);
    const res = await deleteTeam(selectedTeam.id);
    setSaving(false);
    if (res.ok) {
      setShowDelete(false);
      setMemberMap((prev) => {
        const next = { ...prev };
        delete next[selectedTeam.id];
        return next;
      });
    }
  }

  async function handleAddMember() {
    if (!selectedTeam || !selectedUserId) return;
    setSaving(true);
    setDialogError('');
    const res = await addMember(selectedTeam.id, selectedUserId);
    setSaving(false);
    if (res.ok) {
      const members = await fetchMembers(selectedTeam.id);
      setMemberMap((prev) => ({ ...prev, [selectedTeam.id]: members }));
      setShowAddMember(false);
    } else {
      setDialogError(res.error || '');
    }
  }

  async function handleRemoveMember(teamId: string, userId: string) {
    const res = await removeMember(teamId, userId);
    if (res.ok) {
      const members = await fetchMembers(teamId);
      setMemberMap((prev) => ({ ...prev, [teamId]: members }));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold text-foreground">Danh sách đội nhóm</h2>
        {isAdmin && (
          <Button color="primary" startContent={<Plus size={18} />} onPress={openCreate}>
            Thêm đội nhóm
          </Button>
        )}
      </div>

      {error && <Alert color="danger" title={error} onClose={() => undefined} />}

      {loading && (
        <div className="flex justify-center py-4">
          <Spinner size="sm" color="primary" />
        </div>
      )}

      {!loading && teams.length === 0 && (
        <div className="py-8 text-center text-foreground-500">Chưa có đội nhóm nào</div>
      )}

      {teams.map((team) => {
        const expanded = expandedId === team.id;
        const members = memberMap[team.id] ?? [];
        return (
          <Card
            key={team.id}
            className="rounded-2xl border border-default bg-content1 shadow-sm"
          >
            <CardBody className="p-0">
              <button
                type="button"
                onClick={() => void toggleTeam(team.id)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left"
              >
                <UsersThree size={20} className="text-primary" />
                <span className="font-medium">{team.name}</span>
                <Chip size="sm" variant="flat">
                  {members.length} thành viên
                </Chip>
                <span className="ml-auto flex items-center gap-1">
                  {isAdmin && (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      aria-label="Sửa"
                      title="Sửa"
                      onPress={() => openEdit(team)}
                    >
                      <PencilSimple size={16} />
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      color="danger"
                      aria-label="Xóa"
                      title="Xóa"
                      onPress={() => openDelete(team)}
                    >
                      <Trash size={16} />
                    </Button>
                  )}
                  <CaretDown
                    size={16}
                    className={`text-foreground-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                  />
                </span>
              </button>

              {expanded && (
                <div className="border-t border-default px-4 py-3">
                  <div className="mb-3 flex flex-wrap gap-2">
                    {members.map((m) => (
                      <Chip
                        key={m.userId}
                        size="sm"
                        variant="flat"
                        avatar={<Avatar name={m.fullName} size="sm" className="bg-primary text-primary-foreground" />}
                        onClose={isAdmin ? () => void handleRemoveMember(team.id, m.userId) : undefined}
                      >
                        {m.fullName}
                      </Chip>
                    ))}
                    {members.length === 0 && (
                      <span className="text-sm text-foreground-500">Chưa có thành viên</span>
                    )}
                  </div>
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="flat"
                      startContent={<UserPlus size={16} />}
                      onPress={() => openAddMember(team)}
                    >
                      Thêm thành viên
                    </Button>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        );
      })}

      {/* Create team dialog */}
      <Modal isOpen={showCreate} onOpenChange={setShowCreate} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">Thêm đội nhóm</ModalHeader>
              <ModalBody>
                <Input
                  label="Tên đội nhóm *"
                  value={teamName}
                  onValueChange={setTeamName}
                  variant="bordered"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCreate();
                  }}
                />
                {dialogError && <Alert color="danger" title={dialogError} />}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Hủy
                </Button>
                <Button color="primary" isLoading={saving} onPress={() => void handleCreate()}>
                  Tạo
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Edit team dialog */}
      <Modal isOpen={showEdit} onOpenChange={setShowEdit} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">Sửa đội nhóm</ModalHeader>
              <ModalBody>
                <Input
                  label="Tên đội nhóm *"
                  value={teamName}
                  onValueChange={setTeamName}
                  variant="bordered"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleUpdate();
                  }}
                />
                {dialogError && <Alert color="danger" title={dialogError} />}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Hủy
                </Button>
                <Button color="primary" isLoading={saving} onPress={() => void handleUpdate()}>
                  Lưu
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Delete confirm dialog */}
      <Modal isOpen={showDelete} onOpenChange={setShowDelete} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">Xác nhận xóa</ModalHeader>
              <ModalBody>
                Bạn có chắc muốn xóa đội nhóm &quot;{selectedTeam?.name}&quot;?
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Hủy
                </Button>
                <Button color="danger" isLoading={saving} onPress={() => void handleDelete()}>
                  Xóa
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Add member dialog */}
      <Modal isOpen={showAddMember} onOpenChange={setShowAddMember} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">Thêm thành viên</ModalHeader>
              <ModalBody>
                <Select
                  label="Chọn nhân viên"
                  placeholder="Chọn nhân viên"
                  variant="bordered"
                  selectedKeys={selectedUserId ? [selectedUserId] : []}
                  onSelectionChange={(keys) => setSelectedUserId(firstKey(keys))}
                >
                  {availableUsers.map((u) => (
                    <SelectItem key={u.id}>{u.fullName}</SelectItem>
                  ))}
                </Select>
                {dialogError && <Alert color="danger" title={dialogError} />}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Hủy
                </Button>
                <Button color="primary" isLoading={saving} onPress={() => void handleAddMember()}>
                  Thêm
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
