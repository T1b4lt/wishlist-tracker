import { useParams } from 'wouter';

const ProductPage = () => {
  const params = useParams();

  return <div>ProductPage: {params.productId}</div>;
};

export default ProductPage;
