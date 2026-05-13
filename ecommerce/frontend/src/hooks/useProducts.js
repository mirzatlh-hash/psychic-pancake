//ecommerce/frontend/src/hooks/useProducts.js
import { useEffect, useState } from "react";
import API from "../../api/index.js";
import { useParams } from "react-router-dom";
export const useProducts = (filters = {}) => {
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [brands, setBrands] = useState([]);
  const [totalProductsCount, setTotalProductsCount] = useState(0);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [trendingProducts, setTrendingProducts] = useState([]);
  const [newArrivals, setnewArrivals] = useState([]);
  useEffect(() => {
    const fetchProducts = async (id) => {
      setLoadingProducts(true);

      const params = {
        page: currentPage,
        limit: 12,
        priceMin: filters.priceRange?.[0] ?? 0,
        priceMax: filters.priceRange?.[1] ?? 100000,
      };

      // Category — assuming backend accepts name (we'll test this assumption)
      if (filters.category && filters.category !== "All") {
        params.category = filters.category;
      }
      if (filters.brand && filters.brand !== "All") {
        params.brand = filters.brand;
      }
      // We'll add brand later once backend supports it

      // Sorting mapping
      let sortField = "createdAt";
      let sortOrder = "desc";

      switch (filters.sortBy) {
        case "newest":
          sortField = "createdAt";
          sortOrder = "desc";
          break;
        case "oldest":
          sortField = "createdAt";
          sortOrder = "asc";
          break;
        case "price-asc":
          sortField = "price";
          sortOrder = "asc";
          break;
        case "price-desc":
          sortField = "price";
          sortOrder = "desc";
          break;
        case "rating-desc":
          sortField = "rating";
          sortOrder = "desc";
          break;
        case "rating-asc":
          sortField = "rating";
          sortOrder = "asc";
          break;
        default:
          break;
      }

      params.sortField = sortField;
      params.sortOrder = sortOrder;

      try {
        const ProductRes = await API.get("/products/all", { params });
        const BrandRes = await API.get("/products/brands");
        const trendingRes = await API.get("/products/trending");
        setBrands(BrandRes.data.brandsWithCount || []);
        setProducts(ProductRes.data.products || []);
        setTotalProductsCount(ProductRes.data.TotalProductCount || 0);
        setTotalProducts(ProductRes.data.totalProducts || 0);
        setTotalPages(ProductRes.data.totalPages || 1);
        setFeaturedProducts(ProductRes.data.featuredProducts || []);
        setTrendingProducts(trendingRes.data.trendingProducts || []);

        setnewArrivals(ProductRes.data.newArrivals || []);
   
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingProducts(false);
      }
    };

    fetchProducts();
  }, [
    currentPage,
    filters.brand,
    filters.category,
    filters.priceRange?.[0],
    filters.priceRange?.[1],
    filters.sortBy,
  ]);

  return {
    products,
    brands,
    loadingProducts,
    currentPage,
    featuredProducts,
    setCurrentPage,
    newArrivals,
    totalProductsCount,
    trendingProducts,
    totalPages,
    totalProducts,
  };
};
