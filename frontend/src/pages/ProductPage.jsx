import React from 'react';
import PropTypes from 'prop-types';

const ProductPage = (props) => {
  const { productId } = props;
  return <div>ProductPage: {productId}</div>;
};

ProductPage.propTypes = {
  productId: PropTypes.string.isRequired
};

export default ProductPage;
