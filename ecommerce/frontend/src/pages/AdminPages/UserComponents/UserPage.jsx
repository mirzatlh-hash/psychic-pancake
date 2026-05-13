//ecommerce/frontend/src/pages/AdminPages/UserComponents/UserPage.jsx
import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../../../../api";
import { MdDelete } from "react-icons/md";
// MUI imports
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Box,
  Typography,
  CircularProgress,
  Chip,
  IconButton,
  Tooltip,
} from "@mui/material";
import { useAuth } from "../../../../context/AuthContext";

const UserPage = () => {
  const [alluser, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  // Pagination & search state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const {user} = useAuth();
  const currentUserId = user?._id || localStorage.getItem("userId");
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await API.get("/admin/users/all");
        setAllUsers(res.data.users || res.data || []);
      } catch (err) {
        console.error("Failed to fetch user:", err);
        setError("Failed to load user. Please try again later.");
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, []);

  // Filter user based on search term
  const filteredUser = useMemo(() => {
    if (!searchTerm.trim()) return alluser;

    const lowerSearch = searchTerm.toLowerCase();
    return alluser.filter((user) => {
      const idMatch = user._id.toLowerCase().includes(lowerSearch);
      const statusMatch = user.role?.toLowerCase().includes(lowerSearch);
      const amountMatch = String(user.totalAmount || "").includes(lowerSearch);
      const paymentMatch = user.paymentMethod
        ?.toLowerCase()
        .includes(lowerSearch);
      return idMatch || statusMatch || amountMatch || paymentMatch;
    });
  }, [alluser, searchTerm]);

  // Pagination slice
  const paginatedUser = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredUser.slice(start, start + rowsPerPage);
  }, [filteredUser, page, rowsPerPage]);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };
  const handleStatusChange = async (id, newRole) => {
    try {
      const res = await API.put(`/admin/users/${id}/role`, {
        role: newRole,
      });
      if (res.data.success) {
        setAllUsers((prev) =>
          prev.map((user) =>
            user._id === id ? { ...user, role: newRole } : user,
          ),
        );
      } else {
        alert("Failed to update user role");
      }
    } catch (error) {
      console.error("Error updating user role:", error);
    }
  };
  const getStatusColor = (role) => {
    switch (role?.toLowerCase()) {
      case "pending":
        return "warning";
      case "processing":
        return "info";
      case "shipped":
        return "primary";
      case "delivered":
        return "success";
      case "cancelled":
        return "error";
      default:
        return "default";
    }
  };
  const handleDeleteOrder = async (id) => {
    try {
      // Assuming there's an API endpoint to delete an user
      const res = await API.delete(`/admin/users/${id}`);
      if (res.data.success) {
        setAllUsers((prev) => prev.filter((user) => user._id !== id));
        alert("user deleted successfully");
      } else {
        alert("Failed to delete user");
      }
    } catch (error) {
      console.error("Error deleting user:", error);
    }
  };
  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="60vh"
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Typography color="error" align="center" variant="h6" mt={4}>
        {error}
      </Typography>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: "auto" }}>
      <Typography variant="h4" gutterBottom>
        User ({filteredUser.length})
      </Typography>

      {/* Search Bar */}
      <Box sx={{ mb: 3, maxWidth: 400 }}>
        <TextField
          fullWidth
          label="Search user..."
          variant="outlined"
          size="small"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setPage(0); // reset to first page on search
          }}
          placeholder="Search by ID, role, amount..."
        />
      </Box>
      <button onClick={() => navigate("/admin/users/usermanagement")}>
        Manage Users
      </button>
      <Paper elevation={2} sx={{ borderRadius: 2, overflow: "hidden" }}>
        <TableContainer>
          <Table sx={{ minWidth: 650 }}>
            <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
              <TableRow>
                <TableCell>
                  <strong>Date Joined</strong>
                </TableCell>
                <TableCell>
                  <strong>Name</strong>
                </TableCell>
                <TableCell>
                  <strong>Email</strong>
                </TableCell>
                <TableCell>
                  <strong>Address</strong>
                </TableCell>
                <TableCell align="center">
                  <strong>Phone</strong>
                </TableCell>
                <TableCell align="center">
                  <strong>Role</strong>
                </TableCell>
                <TableCell align="center">
                  <strong>Edit Role</strong>
                </TableCell>
                <TableCell align="center">
                  <strong>See Profile</strong>
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {paginatedUser.map((user) => (
                <TableRow key={user._id} hover>
                  <TableCell>
                    {user.createdAt
                      ? new Date(user.createdAt).toLocaleString("en-PK", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "—"}
                  </TableCell>

                  <TableCell>{user.name || "—"}</TableCell>
                  <TableCell>{user.email || "—"}</TableCell>
                  <TableCell>{user?.address || ""}</TableCell>
                  <TableCell align="center">{user?.phone || 0}</TableCell>

                  <TableCell>
                    <Chip
                      label={user.role || "Unknown"}
                      color={getStatusColor(user.role)}
                      size="small"
                      sx={{ minWidth: 90, fontWeight: 500 }}
                    />
                  </TableCell>
                  {/* making vertical ellipsis icon menu drop down in mui which shows the option when clicked on dropdown Completed Processing On Hold Pending Delete */}

                  <TableCell align="center">
                    <select
                      value={user.role || "Guest"}
                      onChange={(e) =>
                        handleStatusChange(user._id, e.target.value)
                      }
                      style={{
                        padding: "5px 10px",
                        borderRadius: "4px",
                        border: "1px solid #ddd",
                        marginRight: "8px",
                      }}
                    >
                      <option value="User">User</option>
                      <option value="Admin">Admin</option>
                      <option value="Customer">Customer</option>
                      <option value="Guest">Guest</option>
                    </select>
                    {/* dont show delete button if user is current user  */}
                    {currentUserId !== user._id && (
                      <button
                        onClick={() => {
                          if (window.confirm("Delete user?"))
                            handleDeleteOrder(user._id);
                        }}
                        style={{
                          background: "#ffffff",
                          color: "black",
                          border: "none",
                          padding: "5px 10px",
                          borderRadius: "4px",
                          cursor: "pointer",
                        }}
                      >
                        <MdDelete />
                      </button>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link to={`/admin/users/${user._id}`}>
                      <button
                        style={{
                          background: "#ffffff",
                          color: "black",
                          border: "none",
                          padding: "5px 10px",
                          borderRadius: "4px",
                          cursor: "pointer",
                        }}
                      >
                        View Profile
                      </button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          rowsPerPageOptions={[5, 10, 25, 50]}
          component="div"
          count={filteredUser.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          labelRowsPerPage="Rows per page:"
          labelDisplayedRows={({ from, to, count }) =>
            `${from}–${to} of ${count !== -1 ? count : `more than ${to}`}`
          }
        />
      </Paper>
    </Box>
  );
};

export default UserPage;
